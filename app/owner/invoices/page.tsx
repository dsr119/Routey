import Link from "next/link";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses, clients, invoices } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { shortDateIn, todayIn } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { daysOverdue, invoiceState, STATE_LABELS, summarize, type InvoiceState } from "@/lib/invoice-status";
import { newInvoice } from "@/app/actions/invoices";

const FILTERS = [
  { key: "unpaid", label: "Unpaid", states: ["not_opened", "opened", "overdue"] },
  { key: "overdue", label: "Overdue", states: ["overdue"] },
  { key: "not_opened", label: "Not opened", states: ["not_opened"] },
  { key: "opened", label: "Opened, not paid", states: ["opened"] },
  { key: "not_sent", label: "Not sent", states: ["not_sent"] },
  { key: "paid", label: "Paid", states: ["paid"] },
  { key: "void", label: "Void", states: ["void"] },
] as const satisfies readonly { key: string; label: string; states: readonly InvoiceState[] }[];
type Filter = (typeof FILTERS)[number];

export default async function Invoices({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const owner = await requireRole("owner");
  const asked = (await searchParams).show;
  const filter: Filter = FILTERS.find((f) => f.key === asked) ?? FILTERS[0];
  const business = await db.query.businesses.findFirst({ where: eq(businesses.id, owner.businessId) });
  const tz = business?.timezone ?? "America/New_York";
  const now = new Date();

  const all = await db
    .select({
      id: invoices.id,
      number: invoices.number,
      status: invoices.status,
      totalCents: invoices.totalCents,
      createdAt: invoices.createdAt,
      sentAt: invoices.sentAt,
      emailedAt: invoices.emailedAt,
      textedAt: invoices.textedAt,
      dueAt: invoices.dueAt,
      firstViewedAt: invoices.firstViewedAt,
      lastViewedAt: invoices.lastViewedAt,
      viewCount: invoices.viewCount,
      paidAt: invoices.paidAt,
      client: clients.name,
    })
    .from(invoices)
    .innerJoin(clients, eq(invoices.clientId, clients.id))
    .where(eq(invoices.businessId, owner.businessId))
    .orderBy(desc(invoices.number));

  const sum = summarize(all, now, todayIn(tz, now).slice(0, 7), (d) => todayIn(tz, d).slice(0, 7));
  const withState = all.map((r) => ({ ...r, state: invoiceState(r, now) }));
  const counts = Object.fromEntries(
    FILTERS.map((f) => [f.key, withState.filter((r) => (f.states as readonly string[]).includes(r.state)).length]),
  );
  const rows = withState.filter((r) => (filter.states as readonly string[]).includes(r.state));
  // Most overdue first on the overdue list, newest first everywhere else.
  if (filter.key === "overdue") rows.sort((a, b) => (a.dueAt?.getTime() ?? 0) - (b.dueAt?.getTime() ?? 0));
  const total = rows.reduce((s, r) => s + r.totalCents, 0);
  const date = (d: Date | null) => (d ? shortDateIn(tz, d) : "");

  const clientList = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(and(eq(clients.businessId, owner.businessId), eq(clients.active, true)))
    .orderBy(asc(clients.name));

  return (
    <>
      <h1>Invoices</h1>
      <div className="summary">
        <Link href="/owner/invoices?show=unpaid" className="box">
          <span className="muted">Owed to you</span>
          <strong>{formatCents(sum.owedCents)}</strong>
          <span className="muted">{sum.owedCount} unpaid</span>
        </Link>
        <Link href="/owner/invoices?show=overdue" className={`box ${sum.overdueCount ? "late" : ""}`}>
          <span className="muted">Overdue</span>
          <strong>{formatCents(sum.overdueCents)}</strong>
          <span className="muted">{sum.overdueCount} past due</span>
        </Link>
        <Link href="/owner/invoices?show=paid" className="box">
          <span className="muted">Paid this month</span>
          <strong>{formatCents(sum.paidMonthCents)}</strong>
          <span className="muted">{sum.paidMonthCount} paid</span>
        </Link>
        <Link href="/owner/invoices?show=not_sent" className="box">
          <span className="muted">Not sent yet</span>
          <strong>{sum.notSentCount}</strong>
          <span className="muted">to look over</span>
        </Link>
      </div>

      <div className="row" style={{ marginBottom: 16 }}>
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/owner/invoices?show=${f.key}`}
            className={`button ${f.key === filter.key ? "" : "secondary"}`}
          >
            {f.label} ({counts[f.key]})
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="muted">No invoices here.</p>
      ) : (
        <div className="scroll">
          <table className="cards">
            <thead>
              <tr>
                <th>#</th>
                <th>Client</th>
                <th>Sent</th>
                <th>Opened</th>
                <th>Due</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td data-label="#">
                    <Link href={`/owner/invoices/${r.id}`}>{r.number}</Link>
                  </td>
                  <td data-label="Client">{r.client}</td>
                  <td data-label="Sent">
                    {r.sentAt ? date(r.sentAt) : <span className="muted">Not sent</span>}
                    {r.sentAt && (
                      <div className="hint">
                        {[r.emailedAt && "email", r.textedAt && "text"].filter(Boolean).join(", ") || "not delivered"}
                      </div>
                    )}
                  </td>
                  <td data-label="Opened">
                    {r.firstViewedAt ? (
                      <>
                        {date(r.firstViewedAt)}
                        {r.viewCount > 1 && <div className="hint">{r.viewCount} times, last {date(r.lastViewedAt)}</div>}
                      </>
                    ) : r.sentAt ? (
                      <span className="muted">No</span>
                    ) : null}
                  </td>
                  <td data-label="Due">{date(r.dueAt)}</td>
                  <td data-label="Status">
                    <span className={`state ${r.state}`}>
                      {r.state === "overdue"
                        ? `Overdue ${daysOverdue(r.dueAt, now)} day${daysOverdue(r.dueAt, now) === 1 ? "" : "s"}`
                        : r.state === "paid"
                          ? `Paid ${date(r.paidAt)}`
                          : STATE_LABELS[r.state]}
                    </span>
                  </td>
                  <td data-label="Total" style={{ textAlign: "right" }}>{formatCents(r.totalCents)}</td>
                </tr>
              ))}
              <tr className="total">
                <td colSpan={6}>
                  <strong>Total</strong>
                </td>
                <td style={{ textAlign: "right" }}>
                  <strong>{formatCents(total)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="hint">
        &ldquo;Opened&rdquo; means someone opened the pay link. Your own views don&apos;t count. It&apos;s a good
        sign the client saw it, not proof.
      </p>

      <h2>New invoice</h2>
      {clientList.length === 0 ? (
        <p className="muted">Add a client first.</p>
      ) : (
        <form action={newInvoice} className="box">
          <label>
            Client
            <select name="clientId">
              {clientList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <button>Start invoice</button>
        </form>
      )}
    </>
  );
}
