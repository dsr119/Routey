import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { payments, taxRates } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { invoiceWithLines, payLink } from "@/lib/invoicing";
import { formatPercent } from "@/lib/invoice-math";
import { daysOverdue, invoiceState } from "@/lib/invoice-status";
import { shortDateIn } from "@/lib/dates";
import { centsToInput, formatCents } from "@/lib/money";
import {
  addLine,
  emailAgain,
  markPaid,
  removeLine,
  send,
  setInvoiceTax,
  textAgain,
  updateLine,
  voidInvoice,
} from "@/app/actions/invoices";
import ActionForm from "@/components/ActionForm";
import InvoiceView from "@/components/InvoiceView";

function LineFields({ l }: { l?: { description: string; quantity: number; unitCents: number; taxable: boolean } }) {
  return (
    <>
      <label>
        Description
        <input name="description" defaultValue={l?.description} required />
      </label>
      <div className="row">
        <label style={{ flex: "1 1 80px" }}>
          Qty
          <input name="quantity" inputMode="numeric" defaultValue={l?.quantity ?? 1} />
        </label>
        <label style={{ flex: "1 1 120px" }}>
          Price
          <input
            name="price"
            inputMode="decimal"
            defaultValue={l && l.unitCents > 0 ? centsToInput(l.unitCents) : ""}
            required
          />
        </label>
        <label style={{ fontWeight: 400 }}>
          <input type="checkbox" name="taxable" defaultChecked={l?.taxable ?? true} /> Taxable
        </label>
      </div>
    </>
  );
}

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const owner = await requireRole("owner");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const data = await invoiceWithLines(owner.businessId, id);
  if (!data || !data.business) notFound();
  const { invoice, lines } = data;
  const now = new Date();
  const state = invoiceState(invoice, now);
  const day = (d: Date) => shortDateIn(data.business?.timezone ?? "America/New_York", d);
  const rates = await db
    .select()
    .from(taxRates)
    .where(eq(taxRates.businessId, owner.businessId))
    .orderBy(asc(taxRates.name));
  const paid = await db.select().from(payments).where(eq(payments.invoiceId, invoice.id));
  const draft = invoice.status === "draft";
  const needsPrice = lines.some((l) => l.unitCents === 0);

  return (
    <>
      <p>
        <Link href={`/owner/invoices?show=${invoice.status}`}>← Invoices</Link>
        {data.client && (
          <>
            {" · "}
            <Link href={`/owner/clients/${data.client.id}`}>{data.client.name}</Link>
          </>
        )}
      </p>

      {draft && needsPrice && (
        <p className="notice">The crew noted extra work. Price it below, then send the invoice.</p>
      )}

      <InvoiceView {...data} business={data.business} />

      {invoice.status === "sent" && invoice.payToken && (
        <section className="box">
          <p style={{ marginTop: 0 }}>
            {invoice.emailedAt
              ? `Emailed to ${data.client?.email} on ${day(invoice.emailedAt)}.`
              : data.client?.email
                ? "Not emailed yet."
                : "This client has no email. Share the pay link another way, or add their email and send it."}
            {data.client?.textInvoices &&
              (invoice.textedAt ? ` Texted to ${data.client.phone} on ${day(invoice.textedAt)}.` : " Not texted yet.")}
          </p>
          <p>
            {invoice.firstViewedAt
              ? `Opened ${day(invoice.firstViewedAt)}` +
                (invoice.viewCount > 1 ? `, ${invoice.viewCount} times, last on ${day(invoice.lastViewedAt!)}.` : ".")
              : "Not opened yet."}
            {invoice.dueAt &&
              (state === "overdue"
                ? ` Overdue by ${daysOverdue(invoice.dueAt, now)} day${daysOverdue(invoice.dueAt, now) === 1 ? "" : "s"} (was due ${day(invoice.dueAt)}).`
                : ` Due ${day(invoice.dueAt)}.`)}
          </p>
          <p>
            Pay link: <a href={payLink(invoice.payToken)}>{payLink(invoice.payToken)}</a>
          </p>
          <p className="muted">
            To take a card in person, open the pay link on your phone and type the card in.
          </p>
          <div className="row">
            {data.client?.email && (
              <ActionForm action={emailAgain} submit={invoice.emailedAt ? "Email again" : "Email it"} keep className="" secondary>
                <input type="hidden" name="invoiceId" value={invoice.id} />
              </ActionForm>
            )}
            {data.client?.textInvoices && data.client.phone && (
              <ActionForm action={textAgain} submit={invoice.textedAt ? "Text again" : "Text it"} keep className="" secondary>
                <input type="hidden" name="invoiceId" value={invoice.id} />
              </ActionForm>
            )}
          </div>
        </section>
      )}

      {draft && (
        <>
          <h2>Edit</h2>
          {lines.map((l) => (
            <details key={l.id} className="box">
              <summary>
                {l.description}: {l.unitCents === 0 ? <strong className="error">needs a price</strong> : formatCents(l.unitCents * l.quantity)}
              </summary>
              <ActionForm action={updateLine} submit="Save line" keep className="">
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <input type="hidden" name="lineId" value={l.id} />
                <LineFields l={l} />
              </ActionForm>
              <form action={removeLine} style={{ marginTop: 8 }}>
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <input type="hidden" name="lineId" value={l.id} />
                <button className="link">Remove line</button>
              </form>
            </details>
          ))}
          <details className="box" open={lines.length === 0}>
            <summary>Add a line</summary>
            <ActionForm action={addLine} submit="Add line" className="">
              <input type="hidden" name="invoiceId" value={invoice.id} />
              <LineFields />
            </ActionForm>
          </details>

          <form action={setInvoiceTax} className="box row">
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <label style={{ flex: 1, margin: 0 }}>
              Sales tax
              <select
                name="taxRateId"
                defaultValue={String(rates.find((r) => r.rateMilli === invoice.taxRateMilli)?.id ?? "none")}
              >
                <option value="none">No tax</option>
                {rates.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({formatPercent(r.rateMilli)})
                  </option>
                ))}
              </select>
            </label>
            <button className="secondary">Apply</button>
          </form>
          {rates.length === 0 && (
            <p className="muted">
              Add your sales tax rates on the <Link href="/owner/settings">Settings</Link> page.
            </p>
          )}

          <ActionForm action={send} submit="Send invoice" keep className="">
            <input type="hidden" name="invoiceId" value={invoice.id} />
          </ActionForm>
        </>
      )}

      {(invoice.status === "draft" || invoice.status === "sent") && (
        <>
          <h2>Got paid another way?</h2>
          <ActionForm action={markPaid} submit="Mark paid" keep secondary>
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <label>
              How
              <select name="method">
                <option value="cash">Cash</option>
                <option value="check">Check</option>
                <option value="card">Card, outside Routey</option>
                <option value="other">Other</option>
              </select>
            </label>
          </ActionForm>
          <form action={voidInvoice}>
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <button className="link">Void this invoice</button>
          </form>
        </>
      )}

      {paid.length > 0 && (
        <>
          <h2>Payments</h2>
          <ul>
            {paid.map((p) => (
              <li key={p.id}>
                {formatCents(p.amountCents)} by {p.method} on{" "}
                {p.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
