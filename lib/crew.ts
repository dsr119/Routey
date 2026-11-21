import "server-only";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  businesses,
  clients,
  crewMembers,
  crews,
  jobs,
  properties,
  routes,
  stops,
  timeEntries,
} from "@/db/schema";
import { todayIn } from "./dates";

export async function openTimeEntry(userId: number) {
  return db.query.timeEntries.findFirst({
    where: and(eq(timeEntries.userId, userId), isNull(timeEntries.clockOut)),
  });
}

export async function businessTimezone(businessId: number): Promise<string> {
  const biz = await db.query.businesses.findFirst({ where: eq(businesses.id, businessId) });
  return biz?.timezone ?? "America/New_York";
}

// Today's routes for every crew this employee is on, with stops in order.
// Prices are left out on purpose: employees never see them.
export async function todaysRoutes(user: { id: number; businessId: number }) {
  const tz = await businessTimezone(user.businessId);
  const day = todayIn(tz);
  const myCrews = await db
    .select({ id: crewMembers.crewId })
    .from(crewMembers)
    .where(eq(crewMembers.userId, user.id));
  if (myCrews.length === 0) return { tz, day, routes: [] };

  const routeRows = await db
    .select({
      id: routes.id,
      crew: crews.name,
      startAddress: routes.startAddress,
      endAddress: routes.endAddress,
    })
    .from(routes)
    .innerJoin(crews, eq(routes.crewId, crews.id))
    .where(
      and(
        eq(routes.businessId, user.businessId),
        eq(routes.day, day),
        inArray(routes.crewId, myCrews.map((c) => c.id)),
      ),
    )
    .orderBy(asc(crews.name));
  if (routeRows.length === 0) return { tz, day, routes: [] };

  const stopRows = await db
    .select({
      id: stops.id,
      routeId: stops.routeId,
      position: stops.position,
      status: stops.status,
      arrivedAt: stops.arrivedAt,
      doneAt: stops.doneAt,
      extraWorkNote: stops.extraWorkNote,
      notDoneReason: stops.notDoneReason,
      service: jobs.service,
      urgent: jobs.urgent,
      estimatedMinutes: jobs.estimatedMinutes,
      address: properties.address,
      description: properties.description,
      client: clients.name,
    })
    .from(stops)
    .innerJoin(jobs, eq(stops.jobId, jobs.id))
    .innerJoin(properties, eq(jobs.propertyId, properties.id))
    .innerJoin(clients, eq(properties.clientId, clients.id))
    .where(inArray(stops.routeId, routeRows.map((r) => r.id)))
    .orderBy(asc(stops.position));

  return {
    tz,
    day,
    routes: routeRows.map((r) => ({ ...r, stops: stopRows.filter((s) => s.routeId === r.id) })),
  };
}

// The stop, if this employee is on the crew that owns its route.
export async function stopForEmployee(user: { id: number; businessId: number }, stopId: number) {
  const rows = await db
    .select({ stop: stops, routeId: routes.id })
    .from(stops)
    .innerJoin(routes, eq(stops.routeId, routes.id))
    .innerJoin(
      crewMembers,
      and(eq(crewMembers.crewId, routes.crewId), eq(crewMembers.userId, user.id)),
    )
    .where(and(eq(stops.id, stopId), eq(stops.businessId, user.businessId)));
  return rows[0]?.stop ?? null;
}
