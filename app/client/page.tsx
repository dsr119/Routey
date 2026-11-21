import Link from "next/link";
import { and, asc, desc, eq, gt, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { invoices, jobs, properties, routes, stops } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { businessTimezone } from "@/lib/crew";
import { dayLabel, timeIn, todayIn } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { stopsAway } from "@/lib/routing";
import { STATUS_LABELS } from "@/components/InvoiceView";

function statusLine(
  stop: { status: string; doneAt: Date | null },
  away: number | null,
  tz: string,
): string {
  if (stop.status === "on_site") return "Your crew is there now.";
  if (stop.status === "done") return `Done${stop.doneAt ? ` at ${timeIn(tz, stop.doneAt)}` : ""}.`;
  if (stop.status === "not_done") return "We couldn't finish today. We'll be in touch.";
  if (away === 0) return "Your crew is headed to you next.";
  if (away === 1) return "Your crew is 1 stop away.";
  return `Your crew is ${away} stops away.`;
}

export default async function ClientHome() {
  const user = await requireRole("client");
  if (!user.clientId) return <p>This login isn&apos;t linked to a client. Contact us.</p>;
  const tz = await businessTimezone(user.businessId);
  const today = todayIn(tz);

  const myStops = await db
    .select({
      id: stops.id,
      routeId: stops.routeId,
      status: stops.status,
      doneAt: stops.doneAt,
      day: routes.day,
      service: jobs.service,
      address: properties.address,
    })
    .from(stops)
    .innerJoin(routes, eq(stops.routeId, routes.id))
    .innerJoin(jobs, eq(stops.jobId, jobs.id))
    .innerJoin(properties, eq(jobs.propertyId, properties.id))
    .where(
      and(
        eq(properties.clientId, user.clientId),
        eq(stops.businessId, user.businessId),
        eq(routes.day, today),
      ),
    )
    .orderBy(asc(properties.address));

  // Every stop on the routes that visit this client today, to count stops ahead.
  // Only counts leave this page; other clients' names and addresses never do.
  const routeIds = [...new Set(myStops.map((s) => s.routeId))];
  const routeStops = routeIds.length
    ? await db
        .select({ id: stops.id, routeId: stops.routeId, position: stops.position, status: stops.status })
        .from(stops)
        .where(inArray(stops.routeId, routeIds))
    : [];

  const [next] = await db
    .select({ day: routes.day })
    .from(stops)
    .innerJoin(routes, eq(stops.routeId, routes.id))
    .innerJoin(jobs, eq(stops.jobId, jobs.id))
    .innerJoin(properties, eq(jobs.propertyId, properties.id))
    .where(and(eq(properties.clientId, user.clientId), gt(routes.day, today)))
    .orderBy(asc(routes.day))
    .limit(1);

  const myInvoices = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.clientId, user.clientId), ne(invoices.status, "draft")))
    .orderBy(desc(invoices.number));
  const unpaid = myInvoices.filter((i) => i.status === "sent");
  const owed = unpaid.reduce((sum, i) => sum + i.totalCents, 0);

  return (
    <>
      <h1>Hi {user.name}</h1>

      <h2>Today</h2>
      {myStops.length === 0 ? (
        <p>No service scheduled today.</p>
      ) : (
        myStops.map((s) => (
          <section key={s.id} className="box">
            <div className="muted">
              {s.service} at {s.address}
            </div>
            <p style={{ fontSize: "1.25rem", fontWeight: 600, margin: "6px 0 0" }}>
              {statusLine(s, stopsAway(routeStops.filter((r) => r.routeId === s.routeId), s.id), tz)}
            </p>
          </section>
        ))
      )}
      {next && <p className="muted">Next visit: {dayLabel(next.day)}.</p>}

      <h2>Invoices</h2>
      {unpaid.length > 0 && (
        <p className="notice">
          You owe <strong>{formatCents(owed)}</strong>.
        </p>
      )}
      {myInvoices.length === 0 ? (
        <p className="muted">No invoices yet.</p>
      ) : (
        <table>
          <tbody>
            {myInvoices.map((inv) => (
              <tr key={inv.id}>
                <td>
                  {inv.payToken ? <Link href={`/pay/${inv.payToken}`}>#{inv.number}</Link> : `#${inv.number}`}
                </td>
                <td>{(inv.sentAt ?? inv.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: tz })}</td>
                <td>{formatCents(inv.totalCents)}</td>
                <td>
                  {inv.status === "sent" && inv.payToken ? (
                    <Link className="button" href={`/pay/${inv.payToken}`}>
                      Pay
                    </Link>
                  ) : (
                    STATUS_LABELS[inv.status]
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
