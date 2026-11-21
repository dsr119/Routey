import Link from "next/link";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, invoices } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { formatCents } from "@/lib/money";
import { newInvoice } from "@/app/actions/invoices";
import { STATUS_LABELS } from "@/components/InvoiceView";

const TABS = [
  { key: "draft", label: "Not sent" },
  { key: "sent", label: "Unpaid" },
  { key: "paid", label: "Paid" },
  { key: "void", label: "Void" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export default async function Invoices({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const owner = await requireRole("owner");
  const asked = (await searchParams).show;
  const show: Tab = TABS.some((t) => t.key === asked) ? (asked as Tab) : "draft";

  const rows = await db
    .select({
      id: invoices.id,
      number: invoices.number,
      status: invoices.status,
      totalCents: invoices.totalCents,
      createdAt: invoices.createdAt,
      client: clients.name,
    })
    .from(invoices)
    .innerJoin(clients, eq(invoices.clientId, clients.id))
    .where(and(eq(invoices.businessId, owner.businessId), eq(invoices.status, show)))
    .orderBy(desc(invoices.number));

  const clientList = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(and(eq(clients.businessId, owner.businessId), eq(clients.active, true)))
    .orderBy(asc(clients.name));

  const total = rows.reduce((sum, r) => sum + r.totalCents, 0);

  return (
    <>
      <h1>Invoices</h1>
      <div className="row" style={{ marginBottom: 16 }}>
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/owner/invoices?show=${t.key}`}
            className={`button ${t.key === show ? "" : "secondary"}`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="muted">No {STATUS_LABELS[show].toLowerCase()} invoices.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Client</th>
              <th>Date</th>
              <th style={{ textAlign: "right" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/owner/invoices/${r.id}`}>{r.number}</Link>
                </td>
                <td>{r.client}</td>
                <td>{r.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
                <td style={{ textAlign: "right" }}>{formatCents(r.totalCents)}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={3}>
                <strong>Total</strong>
              </td>
              <td style={{ textAlign: "right" }}>
                <strong>{formatCents(total)}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      )}

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
