import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses, clients, crews, jobs, properties, routes, stops } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { dayLabel, minutesBetween, timeIn } from "@/lib/dates";
import { hasMapsKey } from "@/lib/geocode";
import {
  addStops,
  changeStop,
  deleteRoute,
  optimizeRoute,
  updateRouteEnds,
} from "@/app/actions/routes";
import ActionForm from "@/components/ActionForm";
import { FREQUENCY_LABELS } from "@/components/Fields";

const STATUS: Record<string, string> = {
  waiting: "Not started",
  on_site: "On site",
  done: "Done",
  not_done: "Couldn't finish",
};

export default async function RoutePage({ params }: { params: Promise<{ id: string }> }) {
  const owner = await requireRole("owner");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  const route = await db.query.routes.findFirst({
    where: and(eq(routes.id, id), eq(routes.businessId, owner.businessId)),
  });
  if (!route) notFound();
  const crew = await db.query.crews.findFirst({ where: eq(crews.id, route.crewId) });
  const biz = await db.query.businesses.findFirst({ where: eq(businesses.id, owner.businessId) });
  const tz = biz?.timezone ?? "America/New_York";

  const list = await db
    .select({
      id: stops.id,
      position: stops.position,
      status: stops.status,
      arrivedAt: stops.arrivedAt,
      doneAt: stops.doneAt,
      jobId: jobs.id,
      service: jobs.service,
      urgent: jobs.urgent,
      estimatedMinutes: jobs.estimatedMinutes,
      address: properties.address,
      mapped: properties.lat,
      clientId: clients.id,
      client: clients.name,
    })
    .from(stops)
    .innerJoin(jobs, eq(stops.jobId, jobs.id))
    .innerJoin(properties, eq(jobs.propertyId, properties.id))
    .innerJoin(clients, eq(properties.clientId, clients.id))
    .where(eq(stops.routeId, route.id))
    .orderBy(asc(stops.position));

  const onRoute = new Set(list.map((s) => s.jobId));
  const available = (
    await db
      .select({
        id: jobs.id,
        service: jobs.service,
        frequency: jobs.frequency,
        urgent: jobs.urgent,
        address: properties.address,
        client: clients.name,
      })
      .from(jobs)
      .innerJoin(properties, eq(jobs.propertyId, properties.id))
      .innerJoin(clients, eq(properties.clientId, clients.id))
      .where(
        and(
          eq(jobs.businessId, owner.businessId),
          eq(jobs.active, true),
          eq(properties.active, true),
          eq(clients.active, true),
        ),
      )
      .orderBy(desc(jobs.urgent), asc(clients.name), asc(properties.address))
  ).filter((j) => !onRoute.has(j.id));

  const canDelete = list.every((s) => s.status === "waiting");
  const mapsOn = hasMapsKey();

  return (
    <>
      <p>
        <Link href={`/owner/routes?day=${route.day}`}>← Routes</Link>
      </p>
      <h1>
        {crew?.name}, {dayLabel(route.day)}
      </h1>

      <details className="box">
        <summary>
          Starts at {route.startAddress ?? "(not set)"}
          {route.endAddress !== route.startAddress && <>, ends at {route.endAddress ?? "(not set)"}</>}
        </summary>
        <ActionForm action={updateRouteEnds} submit="Save" keep className="">
          <input type="hidden" name="routeId" value={route.id} />
          <label>
            Start
            <input name="startAddress" defaultValue={route.startAddress ?? ""} />
          </label>
          <label>
            End
            <input name="endAddress" defaultValue={route.endAddress ?? ""} />
          </label>
        </ActionForm>
        <p className="muted">
          The default for new routes is set on the <Link href="/owner/settings">Settings</Link> page.
        </p>
      </details>

      <h2>Stops</h2>
      {list.length === 0 ? (
        <p className="muted">No stops yet. Add some below.</p>
      ) : (
        <>
          <ActionForm action={optimizeRoute} submit="Optimize order" keep className="" secondary>
            <input type="hidden" name="routeId" value={route.id} />
            {!mapsOn && (
              <p className="muted">Optimize will work once a Google Maps key is added.</p>
            )}
          </ActionForm>
          <table style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>#</th>
                <th>Stop</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((s, i) => (
                <tr key={s.id}>
                  <td>{i + 1}</td>
                  <td>
                    <Link href={`/owner/clients/${s.clientId}`}>{s.client}</Link>
                    {s.urgent && <strong className="error"> Urgent</strong>}
                    <div>{s.address}</div>
                    <div className="muted">
                      {s.service}
                      {s.estimatedMinutes ? `, about ${s.estimatedMinutes} min` : ""}
                      {s.mapped === null && mapsOn && ", address not on map"}
                    </div>
                  </td>
                  <td>
                    {STATUS[s.status]}
                    {s.arrivedAt && (
                      <div className="muted">
                        {timeIn(tz, s.arrivedAt)}
                        {s.doneAt && ` to ${timeIn(tz, s.doneAt)}, ${minutesBetween(s.arrivedAt, s.doneAt)} min`}
                      </div>
                    )}
                  </td>
                  <td>
                    <div className="row" style={{ gap: 8 }}>
                      {(["up", "down"] as const).map((dir) => (
                        <form key={dir} action={changeStop}>
                          <input type="hidden" name="routeId" value={route.id} />
                          <input type="hidden" name="stopId" value={s.id} />
                          <input type="hidden" name="change" value={dir} />
                          <button
                            className="link"
                            aria-label={`Move ${dir}`}
                            disabled={dir === "up" ? i === 0 : i === list.length - 1}
                          >
                            {dir === "up" ? "▲" : "▼"}
                          </button>
                        </form>
                      ))}
                      {s.status === "waiting" && (
                        <form action={changeStop}>
                          <input type="hidden" name="routeId" value={route.id} />
                          <input type="hidden" name="stopId" value={s.id} />
                          <input type="hidden" name="change" value="remove" />
                          <button className="link">Remove</button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h2>Add stops</h2>
      {available.length === 0 ? (
        <p className="muted">
          Every active job is already on this route. Add services on a{" "}
          <Link href="/owner/clients">client</Link> page.
        </p>
      ) : (
        <ActionForm action={addStops} submit="Add checked stops">
          <input type="hidden" name="routeId" value={route.id} />
          <div style={{ maxHeight: 420, overflowY: "auto", marginBottom: 12 }}>
            {available.map((j) => (
              <label key={j.id} style={{ fontWeight: 400, display: "flex", gap: 8 }}>
                <input type="checkbox" name="jobId" value={j.id} style={{ marginTop: 4 }} />
                <span>
                  <strong>{j.client}</strong>
                  {j.urgent && <strong className="error"> Urgent</strong>}, {j.address}
                  <span className="muted">
                    {" "}
                    ({j.service}, {FREQUENCY_LABELS[j.frequency].toLowerCase()})
                  </span>
                </span>
              </label>
            ))}
          </div>
        </ActionForm>
      )}

      {canDelete && (
        <form action={deleteRoute} style={{ marginTop: 24 }}>
          <input type="hidden" name="routeId" value={route.id} />
          <button className="link">Delete this route</button>
        </form>
      )}
    </>
  );
}
