"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { businesses, crews, jobs, properties, routes, stops } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { geocode } from "@/lib/geocode";
import { optimizeWithGoogle } from "@/lib/google-routes";
import {
  MAX_OPTIMIZE_STOPS,
  applyOrder,
  moveStop,
  positions,
  splitForOptimize,
  type LatLng,
} from "@/lib/routing";
import type { ActionResult } from "@/components/ActionForm";

async function ownedRoute(businessId: number, id: number) {
  return db.query.routes.findFirst({
    where: and(eq(routes.id, id), eq(routes.businessId, businessId)),
  });
}

async function routeStops(routeId: number) {
  return db
    .select({
      id: stops.id,
      position: stops.position,
      status: stops.status,
      jobId: stops.jobId,
      urgent: jobs.urgent,
      lat: properties.lat,
      lng: properties.lng,
    })
    .from(stops)
    .innerJoin(jobs, eq(stops.jobId, jobs.id))
    .innerJoin(properties, eq(jobs.propertyId, properties.id))
    .where(eq(stops.routeId, routeId))
    .orderBy(asc(stops.position));
}

async function saveOrder(routeId: number, ids: number[]) {
  await db.transaction(async (tx) => {
    for (const { id, position } of positions(ids)) {
      await tx
        .update(stops)
        .set({ position })
        .where(and(eq(stops.id, id), eq(stops.routeId, routeId)));
    }
  });
}

export async function createRoute(_: ActionResult, form: FormData): Promise<ActionResult> {
  const owner = await requireRole("owner");
  const day = String(form.get("day") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { error: "Pick a date." };
  const crew = await db.query.crews.findFirst({
    where: and(eq(crews.id, Number(form.get("crewId"))), eq(crews.businessId, owner.businessId)),
  });
  if (!crew) return { error: "Pick a crew. Add one on the Crews page first." };

  const biz = await db.query.businesses.findFirst({ where: eq(businesses.id, owner.businessId) });
  const [row] = await db
    .insert(routes)
    .values({
      businessId: owner.businessId,
      crewId: crew.id,
      day,
      startAddress: biz?.homeAddress ?? null,
      startLat: biz?.homeLat ?? null,
      startLng: biz?.homeLng ?? null,
      endAddress: biz?.homeAddress ?? null,
      endLat: biz?.homeLat ?? null,
      endLng: biz?.homeLng ?? null,
    })
    .returning({ id: routes.id });
  redirect(`/owner/routes/${row.id}`);
}

export async function updateRouteEnds(_: ActionResult, form: FormData): Promise<ActionResult> {
  const owner = await requireRole("owner");
  const route = await ownedRoute(owner.businessId, Number(form.get("routeId")));
  if (!route) return { error: "Route not found." };

  const changes: Partial<typeof routes.$inferInsert> = {};
  const missed: string[] = [];
  for (const end of ["start", "end"] as const) {
    const typed = String(form.get(`${end}Address`) ?? "").trim() || null;
    const current = route[`${end}Address`];
    if (typed === current && (!typed || route[`${end}Lat`] !== null)) continue;
    const place = typed ? await geocode(typed) : null;
    if (typed && !place) missed.push(end);
    changes[`${end}Address`] = place?.address ?? typed;
    changes[`${end}Lat`] = place?.lat ?? null;
    changes[`${end}Lng`] = place?.lng ?? null;
  }
  if (Object.keys(changes).length) {
    await db.update(routes).set(changes).where(eq(routes.id, route.id));
  }
  revalidatePath(`/owner/routes/${route.id}`);
  return {
    message: missed.length
      ? `Saved, but the ${missed.join(" and ")} address wasn't found on the map.`
      : "Saved.",
  };
}

export async function addStops(_: ActionResult, form: FormData): Promise<ActionResult> {
  const owner = await requireRole("owner");
  const route = await ownedRoute(owner.businessId, Number(form.get("routeId")));
  if (!route) return { error: "Route not found." };
  const jobIds = form.getAll("jobId").map(Number).filter(Number.isInteger);
  if (jobIds.length === 0) return { error: "Check at least one job to add." };

  const picked = await db
    .select({ id: jobs.id, urgent: jobs.urgent })
    .from(jobs)
    .where(and(inArray(jobs.id, jobIds), eq(jobs.businessId, owner.businessId), eq(jobs.active, true)));
  const current = await routeStops(route.id);
  const onRoute = new Set(current.map((s) => s.jobId));
  const fresh = picked.filter((j) => !onRoute.has(j.id));
  if (fresh.length === 0) return { message: "Those jobs are already on this route." };

  const inserted = await db
    .insert(stops)
    .values(
      fresh.map((j, i) => ({
        businessId: owner.businessId,
        routeId: route.id,
        jobId: j.id,
        position: current.length + i + 1,
      })),
    )
    .returning({ id: stops.id, jobId: stops.jobId });

  // Urgent jobs go right after any urgent stops already at the top.
  const urgentNew = inserted.filter((s) => fresh.find((j) => j.id === s.jobId)?.urgent).map((s) => s.id);
  if (urgentNew.length) {
    const ids = current.map((s) => s.id);
    let at = 0;
    while (at < current.length && (current[at].urgent || current[at].status !== "waiting")) at++;
    const normalNew = inserted.map((s) => s.id).filter((id) => !urgentNew.includes(id));
    await saveOrder(route.id, [...ids.slice(0, at), ...urgentNew, ...ids.slice(at), ...normalNew]);
  }

  revalidatePath(`/owner/routes/${route.id}`);
  return { message: `Added ${fresh.length} stop${fresh.length === 1 ? "" : "s"}.` };
}

export async function changeStop(form: FormData) {
  const owner = await requireRole("owner");
  const route = await ownedRoute(owner.businessId, Number(form.get("routeId")));
  if (!route) return;
  const stopId = Number(form.get("stopId"));
  const change = String(form.get("change"));
  const current = await routeStops(route.id);
  const ids = current.map((s) => s.id);

  if (change === "up" || change === "down") {
    await saveOrder(route.id, moveStop(ids, stopId, change));
  } else if (change === "remove") {
    const stop = current.find((s) => s.id === stopId);
    if (stop?.status === "waiting") {
      await db.delete(stops).where(and(eq(stops.id, stopId), eq(stops.routeId, route.id)));
      await saveOrder(route.id, ids.filter((id) => id !== stopId));
    }
  }
  revalidatePath(`/owner/routes/${route.id}`);
}

export async function optimizeRoute(_: ActionResult, form: FormData): Promise<ActionResult> {
  const owner = await requireRole("owner");
  const route = await ownedRoute(owner.businessId, Number(form.get("routeId")));
  if (!route) return { error: "Route not found." };
  if (route.startLat === null || route.startLng === null) {
    return { error: "Set a start address that's found on the map first." };
  }

  const current = await routeStops(route.id);
  // Stops already started or finished keep their place at the front.
  const started = current.filter((s) => s.status !== "waiting");
  const waiting = current.filter((s) => s.status === "waiting");
  const asOrder = waiting.map((s) => ({
    id: s.id,
    urgent: s.urgent,
    point: s.lat !== null && s.lng !== null ? { lat: s.lat, lng: s.lng } : null,
  }));
  const { urgent, rest } = splitForOptimize(asOrder);
  if (rest.length < 2) return { message: "Nothing to reorder." };
  if (rest.some((s) => !s.point)) {
    return { error: "Some stops have addresses that weren't found on the map. Fix those first." };
  }
  if (rest.length > MAX_OPTIMIZE_STOPS) {
    return { error: `Optimize handles up to ${MAX_OPTIMIZE_STOPS} stops at a time. Split this route.` };
  }

  // Start from the last stop the crew has been to (or the last urgent one), if any.
  const lastFixed = [...started, ...waiting.filter((s) => s.urgent)].at(-1);
  const start: LatLng =
    lastFixed && lastFixed.lat !== null && lastFixed.lng !== null
      ? { lat: lastFixed.lat, lng: lastFixed.lng }
      : { lat: route.startLat, lng: route.startLng };
  const end: LatLng =
    route.endLat !== null && route.endLng !== null
      ? { lat: route.endLat, lng: route.endLng }
      : { lat: route.startLat, lng: route.startLng };

  const result = await optimizeWithGoogle(start, end, rest.map((s) => s.point as LatLng));
  if (!result.ok) return { error: result.error };

  await saveOrder(route.id, [...started.map((s) => s.id), ...applyOrder(urgent, rest, result.order)]);
  revalidatePath(`/owner/routes/${route.id}`);
  return {
    message: `Reordered. About ${result.minutes} minutes and ${result.miles} miles of driving.`,
  };
}

export async function deleteRoute(form: FormData) {
  const owner = await requireRole("owner");
  const route = await ownedRoute(owner.businessId, Number(form.get("routeId")));
  if (!route) return;
  const current = await routeStops(route.id);
  if (current.some((s) => s.status !== "waiting")) return;
  await db.delete(routes).where(eq(routes.id, route.id));
  redirect(`/owner/routes?day=${route.day}`);
}
