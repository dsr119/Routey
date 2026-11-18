import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  businesses,
  clients,
  invoiceLines,
  invoices,
  jobs,
  payments,
  properties,
  stops,
  taxRates,
} from "@/db/schema";
import { sendEmail } from "./email";
import { totals } from "./invoice-math";
import { formatCents } from "./money";
import { appUrl, stripe } from "./stripe";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function defaultTaxRate(tx: Tx, businessId: number): Promise<number> {
  const rate = await tx.query.taxRates.findFirst({
    where: and(eq(taxRates.businessId, businessId), eq(taxRates.isDefault, true)),
  });
  return rate?.rateMilli ?? 0;
}

// Takes the next invoice number for the business in one step, so two crews
// finishing at the same moment never get the same number.
async function nextNumber(tx: Tx, businessId: number): Promise<number> {
  const [row] = await tx
    .update(businesses)
    .set({ nextInvoiceNumber: sql`${businesses.nextInvoiceNumber} + 1` })
    .where(eq(businesses.id, businessId))
    .returning({ next: businesses.nextInvoiceNumber });
  return row.next - 1;
}

export async function createInvoice(businessId: number, clientId: number, stopId: number | null = null) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(invoices)
      .values({
        businessId,
        clientId,
        stopId,
        number: await nextNumber(tx, businessId),
        taxRateMilli: await defaultTaxRate(tx, businessId),
      })
      .returning();
    return row;
  });
}

// Recomputes and stores an invoice's totals from its lines.
export async function refreshTotals(invoiceId: number) {
  const invoice = await db.query.invoices.findFirst({ where: eq(invoices.id, invoiceId) });
  if (!invoice) return;
  const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId));
  const t = totals(lines, invoice.taxRateMilli);
  await db
    .update(invoices)
    .set({ subtotalCents: t.subtotalCents, taxCents: t.taxCents, totalCents: t.totalCents })
    .where(eq(invoices.id, invoiceId));
}

export async function invoiceWithLines(businessId: number, invoiceId: number) {
  const invoice = await db.query.invoices.findFirst({
    where: and(eq(invoices.id, invoiceId), eq(invoices.businessId, businessId)),
  });
  if (!invoice) return null;
  const lines = await db
    .select()
    .from(invoiceLines)
    .where(eq(invoiceLines.invoiceId, invoice.id))
    .orderBy(asc(invoiceLines.id));
  const client = await db.query.clients.findFirst({ where: eq(clients.id, invoice.clientId) });
  const business = await db.query.businesses.findFirst({ where: eq(businesses.id, businessId) });
  let serviceAddress: string | null = null;
  let serviceDate: Date | null = null;
  if (invoice.stopId) {
    const [row] = await db
      .select({ address: properties.address, doneAt: stops.doneAt })
      .from(stops)
      .innerJoin(jobs, eq(stops.jobId, jobs.id))
      .innerJoin(properties, eq(jobs.propertyId, properties.id))
      .where(eq(stops.id, invoice.stopId));
    serviceAddress = row?.address ?? null;
    serviceDate = row?.doneAt ?? null;
  }
  return { invoice, lines, client, business, serviceAddress, serviceDate };
}

export function payLink(token: string): string {
  return `${appUrl()}/pay/${token}`;
}

// Emails the client their invoice with the pay link. Safe to call again to
// resend.
export async function emailInvoice(invoiceId: number): Promise<{ sent: boolean; error?: string }> {
  const invoice = await db.query.invoices.findFirst({ where: eq(invoices.id, invoiceId) });
  if (!invoice?.payToken) return { sent: false, error: "Send the invoice first." };
  const client = await db.query.clients.findFirst({ where: eq(clients.id, invoice.clientId) });
  const business = await db.query.businesses.findFirst({ where: eq(businesses.id, invoice.businessId) });
  if (!client?.email) return { sent: false, error: "This client has no email on file." };

  const result = await sendEmail({
    to: client.email,
    replyTo: business?.email,
    subject: `Invoice #${invoice.number} from ${business?.name ?? "us"}: ${formatCents(invoice.totalCents)}`,
    text: [
      `Hi ${client.name},`,
      "",
      `Here is invoice #${invoice.number} from ${business?.name} for ${formatCents(invoice.totalCents)}.`,
      "",
      `See it and pay online: ${payLink(invoice.payToken)}`,
      "",
      "Thank you!",
      business?.name,
      business?.phone ?? "",
    ].join("\n"),
  });
  if (result.sent) {
    await db.update(invoices).set({ emailedAt: new Date() }).where(eq(invoices.id, invoiceId));
  }
  return result;
}

// Marks an invoice sent, gives it a pay link, and emails the client.
export async function sendInvoice(
  invoiceId: number,
): Promise<{ ok: boolean; error?: string; emailError?: string }> {
  const invoice = await db.query.invoices.findFirst({ where: eq(invoices.id, invoiceId) });
  if (!invoice) return { ok: false, error: "Invoice not found." };
  if (invoice.status !== "draft") return { ok: false, error: "This invoice was already sent." };
  if (invoice.totalCents <= 0) return { ok: false, error: "The invoice total is $0." };
  const [updated] = await db
    .update(invoices)
    .set({
      status: "sent",
      sentAt: new Date(),
      payToken: invoice.payToken ?? randomBytes(18).toString("base64url"),
    })
    .where(and(eq(invoices.id, invoiceId), eq(invoices.status, "draft")))
    .returning({ id: invoices.id });
  if (!updated) return { ok: false, error: "This invoice was already sent." };
  const email = await emailInvoice(invoiceId);
  return { ok: true, emailError: email.sent ? undefined : email.error };
}

// Opens a Stripe Checkout page for an unpaid invoice and returns its URL.
// A fresh session is made each time, since Stripe sessions expire after a day
// and the emailed link has to keep working.
export async function startCheckout(payToken: string): Promise<{ url?: string; error?: string }> {
  const s = stripe();
  if (!s) return { error: "Online payment isn't set up yet. Please contact us to pay." };
  const invoice = await db.query.invoices.findFirst({ where: eq(invoices.payToken, payToken) });
  if (!invoice || invoice.status !== "sent") return { error: "This invoice can't be paid online." };
  const client = await db.query.clients.findFirst({ where: eq(clients.id, invoice.clientId) });
  const business = await db.query.businesses.findFirst({ where: eq(businesses.id, invoice.businessId) });

  const session = await s.checkout.sessions.create({
    mode: "payment",
    customer_email: client?.email ?? undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: invoice.totalCents,
          product_data: { name: `Invoice #${invoice.number} from ${business?.name ?? "us"}` },
        },
      },
    ],
    metadata: { invoiceId: String(invoice.id), businessId: String(invoice.businessId) },
    payment_intent_data: { metadata: { invoiceId: String(invoice.id) } },
    success_url: `${appUrl()}/pay/${payToken}?paid=1`,
    cancel_url: `${appUrl()}/pay/${payToken}`,
  });
  await db.update(invoices).set({ stripeSessionId: session.id }).where(eq(invoices.id, invoice.id));
  return session.url ? { url: session.url } : { error: "Stripe didn't return a payment page." };
}

// Records a finished Stripe Checkout payment. Stripe can deliver the same
// event more than once, so this does nothing if the invoice is already paid.
export async function recordStripePayment(session: {
  id: string;
  payment_status: string;
  amount_total: number | null;
  payment_intent: string | { id: string } | null;
  metadata: Record<string, string> | null;
}): Promise<"recorded" | "ignored"> {
  if (session.payment_status !== "paid") return "ignored";
  const invoiceId = Number(session.metadata?.invoiceId);
  if (!Number.isInteger(invoiceId)) return "ignored";
  const paymentIntent =
    typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null);

  return db.transaction(async (tx) => {
    const [invoice] = await tx
      .update(invoices)
      .set({ status: "paid", paidAt: new Date() })
      .where(and(eq(invoices.id, invoiceId), eq(invoices.status, "sent")))
      .returning();
    if (!invoice) return "ignored";
    await tx.insert(payments).values({
      businessId: invoice.businessId,
      invoiceId: invoice.id,
      amountCents: session.amount_total ?? invoice.totalCents,
      method: "online",
      stripePaymentIntentId: paymentIntent,
    });
    return "recorded";
  });
}

// Called once when a crew marks a stop Done. Builds the invoice from the job's
// usual price. It waits as a draft if the crew noted extra work or the owner
// holds invoices for review; otherwise it goes out right away.
export async function afterStopDone(stopId: number): Promise<void> {
  const [row] = await db
    .select({
      businessId: stops.businessId,
      extraWorkNote: stops.extraWorkNote,
      service: jobs.service,
      priceCents: jobs.priceCents,
      taxable: jobs.taxable,
      clientId: properties.clientId,
      holdInvoices: businesses.holdInvoices,
    })
    .from(stops)
    .innerJoin(jobs, eq(stops.jobId, jobs.id))
    .innerJoin(properties, eq(jobs.propertyId, properties.id))
    .innerJoin(businesses, eq(stops.businessId, businesses.id))
    .where(eq(stops.id, stopId));
  if (!row) return;

  const existing = await db.query.invoices.findFirst({ where: eq(invoices.stopId, stopId) });
  if (existing) return;

  const invoice = await createInvoice(row.businessId, row.clientId, stopId);
  const lines: (typeof invoiceLines.$inferInsert)[] = [
    {
      invoiceId: invoice.id,
      description: row.service,
      quantity: 1,
      unitCents: row.priceCents,
      taxable: row.taxable,
    },
  ];
  if (row.extraWorkNote) {
    lines.push({
      invoiceId: invoice.id,
      description: `Extra work: ${row.extraWorkNote}`,
      quantity: 1,
      unitCents: 0,
      taxable: row.taxable,
    });
  }
  await db.insert(invoiceLines).values(lines);
  await refreshTotals(invoice.id);

  if (!row.extraWorkNote && !row.holdInvoices) await sendInvoice(invoice.id);
}
