"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { stops, timeEntries } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { openTimeEntry, stopForEmployee } from "@/lib/crew";
import { afterStopDone } from "@/lib/invoicing";
import type { ActionResult } from "@/components/ActionForm";

export async function clockIn() {
  const user = await requireRole("employee");
  if (!(await openTimeEntry(user.id))) {
    await db
      .insert(timeEntries)
      .values({ businessId: user.businessId, userId: user.id, clockIn: new Date() });
  }
  revalidatePath("/crew");
}

export async function clockOut() {
  const user = await requireRole("employee");
  const entry = await openTimeEntry(user.id);
  if (entry) {
    await db.update(timeEntries).set({ clockOut: new Date() }).where(eq(timeEntries.id, entry.id));
  }
  revalidatePath("/crew");
}

export async function arrive(_: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireRole("employee");
  if (!(await openTimeEntry(user.id))) return { error: "Clock in first." };
  const stop = await stopForEmployee(user, Number(form.get("stopId")));
  if (!stop) return { error: "That stop isn't on your route." };
  if (stop.status !== "waiting") return undefined;

  const onSite = await db.query.stops.findFirst({
    where: and(eq(stops.routeId, stop.routeId), eq(stops.status, "on_site")),
  });
  if (onSite) return { error: "Finish the stop you're at first." };

  await db
    .update(stops)
    .set({ status: "on_site", arrivedAt: new Date() })
    .where(and(eq(stops.id, stop.id), eq(stops.status, "waiting")));
  revalidatePath("/crew");
  return undefined;
}

export async function finish(_: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireRole("employee");
  const stop = await stopForEmployee(user, Number(form.get("stopId")));
  if (!stop) return { error: "That stop isn't on your route." };
  if (stop.status !== "on_site") return undefined;

  const extra = String(form.get("extraWork") ?? "").trim() || null;
  const [updated] = await db
    .update(stops)
    .set({ status: "done", doneAt: new Date(), extraWorkNote: extra })
    .where(and(eq(stops.id, stop.id), eq(stops.status, "on_site")))
    .returning({ id: stops.id });
  // Only the request that actually flipped the stop to done bills it.
  if (updated) await afterStopDone(stop.id);
  revalidatePath("/crew");
  return undefined;
}

export async function couldNotFinish(_: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireRole("employee");
  const stop = await stopForEmployee(user, Number(form.get("stopId")));
  if (!stop) return { error: "That stop isn't on your route." };
  if (stop.status === "done" || stop.status === "not_done") return undefined;
  const reason = String(form.get("reason") ?? "").trim();
  if (!reason) return { error: "Say why, so the owner knows." };

  await db
    .update(stops)
    .set({ status: "not_done", doneAt: new Date(), notDoneReason: reason })
    .where(eq(stops.id, stop.id));
  revalidatePath("/crew");
  return undefined;
}
