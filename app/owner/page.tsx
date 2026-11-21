import Link from "next/link";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { clients, crews, invoices, jobs, properties, routes, stops, timeEntries, users } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { businessTimezone } from "@/lib/crew";
import { dayLabel, minutesBetween, timeIn, todayIn } from "@/lib/dates";

export default async function OwnerToday() {
  const owner = await requireRole("owner");
  const tz = await businessTimezone(owner.businessId);
  const day = todayIn(tz);
  const now = new Date();

  const clockedIn = await db
    .select({ name: users.name, clockIn: timeEntries.clockIn })
    .from(timeEntries)
    .innerJoin(users, eq(timeEntries.userId, users.id))
    .where(and(eq(timeEntries.businessId, owner.businessId), isNull(timeEntries.clockOut)))
    .orderBy(asc(users.name));

  const todayStops = await db
    .select({
      routeId: routes.id,
      crew: crews.name,
      position: stops.position,
      status: stops.status,
      arrivedAt: stops.arrivedAt,
      doneAt: stops.doneAt,
      extraWorkNote: stops.extraWorkNote,
      notDoneReason: stops.notDoneReason,
      client: clients.name,
      clientId: clients.id,
      address: properties.address,
      estimatedMinutes: jobs.estimatedMinutes,
      invoiceId: invoices.id,
      invoiceStatus: invoices.status,
    })
    .from(stops)
    .innerJoin(routes, eq(stops.routeId, routes.id))
    .innerJoin(crews, eq(routes.crewId, crews.id))
    .innerJoin(jobs, eq(stops.jobId, jobs.id))
    .innerJoin(properties, eq(jobs.propertyId, properties.id))
    .innerJoin(clients, eq(properties.clientId, clients.id))
    .leftJoin(invoices, eq(invoices.stopId, stops.id))
    .where(and(eq(routes.businessId, owner.businessId), eq(routes.day, day)))
    .orderBy(asc(crews.name), asc(stops.position));

  const routeIds = [...new Set(todayStops.map((s) => s.routeId))];
  const needsLook = todayStops.filter(
    (s) => (s.extraWorkNote && s.invoiceStatus === "draft") || s.status === "not_done",
  );

  return (
    <>
      <h1>Today, {dayLabel(day)}</h1>

      <h2>Clocked in</h2>
      {clockedIn.length === 0 ? (
        <p className="muted">Nobody is clocked in.</p>
      ) : (
        <ul>
          {clockedIn.map((c) => (
            <li key={c.name}>
              {c.name} since {timeIn(tz, c.clockIn)} ({Math.floor(minutesBetween(c.clockIn, now) / 60)}h{" "}
              {minutesBetween(c.clockIn, now) % 60}m)
            </li>
          ))}
        </ul>
      )}

      {needsLook.length > 0 && (
        <>
          <h2>Needs a look</h2>
          <ul>
            {needsLook.map((s, i) => (
              <li key={i}>
                <Link href={`/owner/clients/${s.clientId}`}>{s.client}</Link>:{" "}
                {s.status === "not_done"
                  ? `couldn't finish. "${s.notDoneReason}"`
                  : (
                    <>
                      extra work to price. &quot;{s.extraWorkNote}&quot;{" "}
                      <Link href={`/owner/invoices/${s.invoiceId}`}>Price it</Link>
                    </>
                  )}
              </li>
            ))}
          </ul>
        </>
      )}

      <h2>Routes</h2>
      {routeIds.length === 0 && (
        <p className="muted">
          No routes today. <Link href="/owner/routes">Plan one</Link>.
        </p>
      )}
      {routeIds.map((id) => {
        const list = todayStops.filter((s) => s.routeId === id);
        const finished = list.filter((s) => s.status === "done" || s.status === "not_done").length;
        const here = list.find((s) => s.status === "on_site");
        return (
          <section key={id} className="box">
            <strong>
              <Link href={`/owner/routes/${id}`}>{list[0].crew}</Link>
            </strong>
            : {finished} of {list.length} stops finished
            {here && here.arrivedAt && (
              <div>
                Now at {here.client}, {here.address}, for {minutesBetween(here.arrivedAt, now)} min
                {here.estimatedMinutes ? ` (estimate ${here.estimatedMinutes})` : ""}
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
