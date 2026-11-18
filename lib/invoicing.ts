import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  businesses,
  clients,
  invoiceLines,
  invoices,
  jobs,
  properties,
  stops,
  taxRates,
} from "@/db/schema";
import { totals } from "./invoice-math";

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

// Marks an invoice sent. The pay link and email are added in the next step.
export async function sendInvoice(invoiceId: number): Promise<{ ok: boolean; error?: string }> {
  const invoice = await db.query.invoices.findFirst({ where: eq(invoices.id, invoiceId) });
  if (!invoice) return { ok: false, error: "Invoice not found." };
  if (invoice.status !== "draft") return { ok: false, error: "This invoice was already sent." };
  if (invoice.totalCents <= 0) return { ok: false, error: "The invoice total is $0." };
  await db
    .update(invoices)
    .set({ status: "sent", sentAt: new Date() })
    .where(and(eq(invoices.id, invoiceId), eq(invoices.status, "draft")));
  return { ok: true };
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
