import Link from "next/link";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { businesses, crews, routes, stops } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { addDays, dayLabel, isDay, todayIn } from "@/lib/dates";
import { createRoute } from "@/app/actions/routes";
import ActionForm from "@/components/ActionForm";

export default async function Routes({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  const owner = await requireRole("owner");
  const biz = await db.query.businesses.findFirst({ where: eq(businesses.id, owner.businessId) });
  const asked = (await searchParams).day;
  const day = isDay(asked) ? asked : todayIn(biz?.timezone ?? "America/New_York");

  const list = await db
    .select({
      id: routes.id,
      crew: crews.name,
      total: sql<number>`(select count(*)::int from ${stops} where ${stops.routeId} = ${routes.id})`,
      done: sql<number>`(select count(*)::int from ${stops} where ${stops.routeId} = ${routes.id} and ${stops.status} in ('done', 'not_done'))`,
    })
    .from(routes)
    .innerJoin(crews, eq(routes.crewId, crews.id))
    .where(and(eq(routes.businessId, owner.businessId), eq(routes.day, day)))
    .orderBy(asc(crews.name));

  const crewList = await db
    .select({ id: crews.id, name: crews.name })
    .from(crews)
    .where(and(eq(crews.businessId, owner.businessId), eq(crews.active, true)))
    .orderBy(asc(crews.name));

  return (
    <>
      <h1>Routes</h1>
      <div className="row" style={{ marginBottom: 16 }}>
        <Link className="button secondary" href={`/owner/routes?day=${addDays(day, -1)}`}>
          ← Day before
        </Link>
        <form className="row">
          <input type="date" name="day" defaultValue={day} style={{ marginTop: 0, width: "auto" }} />
          <button className="secondary">Go</button>
        </form>
        <Link className="button secondary" href={`/owner/routes?day=${addDays(day, 1)}`}>
          Next day →
        </Link>
      </div>
      <h2>{dayLabel(day)}</h2>

      {list.length === 0 ? (
        <p className="muted">No routes on this day.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Crew</th>
              <th>Stops</th>
              <th>Finished</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/owner/routes/${r.id}`}>{r.crew}</Link>
                </td>
                <td>{r.total}</td>
                <td>
                  {r.done} of {r.total}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>New route</h2>
      {crewList.length === 0 ? (
        <p className="notice">
          Add a crew on the <Link href="/owner/crews">Crews</Link> page first.
        </p>
      ) : (
        <ActionForm action={createRoute} submit="Create route">
          <input type="hidden" name="day" value={day} />
          <label>
            Crew
            <select name="crewId">
              {crewList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </ActionForm>
      )}
    </>
  );
}
