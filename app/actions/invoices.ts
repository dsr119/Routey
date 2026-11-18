"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, invoiceLines, invoices, payments, taxRates } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { createInvoice, refreshTotals, sendInvoice } from "@/lib/invoicing";
import { parseDollars } from "@/lib/money";
import type { ActionResult } from "@/components/ActionForm";

async function ownedInvoice(businessId: number, id: number) {
  return db.query.invoices.findFirst({
    where: and(eq(invoices.id, id), eq(invoices.businessId, businessId)),
  });
}

async function ownedDraft(businessId: number, id: number) {
  const invoice = await ownedInvoice(businessId, id);
  return invoice?.status === "draft" ? invoice : null;
}

function lineFields(form: FormData) {
  const description = String(form.get("description") ?? "").trim();
  if (!description) return { error: "Describe the work." } as const;
  const quantity = Number(form.get("quantity") || 1);
  if (!Number.isInteger(quantity) || quantity < 1) return { error: "Quantity should be 1 or more." } as const;
  const unitCents = parseDollars(String(form.get("price") ?? ""));
  if (unitCents === null) return { error: "Enter a price, like 45 or 45.50." } as const;
  return { description, quantity, unitCents, taxable: form.get("taxable") === "on" };
}

function refresh(id: number) {
  revalidatePath(`/owner/invoices/${id}`);
  revalidatePath("/owner/invoices");
}

export async function newInvoice(form: FormData) {
  const owner = await requireRole("owner");
  const client = await db.query.clients.findFirst({
    where: and(eq(clients.id, Number(form.get("clientId"))), eq(clients.businessId, owner.businessId)),
  });
  if (!client) return;
  const invoice = await createInvoice(owner.businessId, client.id);
  redirect(`/owner/invoices/${invoice.id}`);
}

export async function addLine(_: ActionResult, form: FormData): Promise<ActionResult> {
  const owner = await requireRole("owner");
  const invoice = await ownedDraft(owner.businessId, Number(form.get("invoiceId")));
  if (!invoice) return { error: "Only unsent invoices can be changed." };
  const fields = lineFields(form);
  if ("error" in fields) return fields;
  await db.insert(invoiceLines).values({ ...fields, invoiceId: invoice.id });
  await refreshTotals(invoice.id);
  refresh(invoice.id);
  return { message: "Added." };
}

export async function updateLine(_: ActionResult, form: FormData): Promise<ActionResult> {
  const owner = await requireRole("owner");
  const invoice = await ownedDraft(owner.businessId, Number(form.get("invoiceId")));
  if (!invoice) return { error: "Only unsent invoices can be changed." };
  const fields = lineFields(form);
  if ("error" in fields) return fields;
  await db
    .update(invoiceLines)
    .set(fields)
    .where(and(eq(invoiceLines.id, Number(form.get("lineId"))), eq(invoiceLines.invoiceId, invoice.id)));
  await refreshTotals(invoice.id);
  refresh(invoice.id);
  return { message: "Saved." };
}

export async function removeLine(form: FormData) {
  const owner = await requireRole("owner");
  const invoice = await ownedDraft(owner.businessId, Number(form.get("invoiceId")));
  if (!invoice) return;
  await db
    .delete(invoiceLines)
    .where(and(eq(invoiceLines.id, Number(form.get("lineId"))), eq(invoiceLines.invoiceId, invoice.id)));
  await refreshTotals(invoice.id);
  refresh(invoice.id);
}

export async function setInvoiceTax(form: FormData) {
  const owner = await requireRole("owner");
  const invoice = await ownedDraft(owner.businessId, Number(form.get("invoiceId")));
  if (!invoice) return;
  const rateId = String(form.get("taxRateId"));
  let rateMilli = 0;
  if (rateId !== "none") {
    const rate = await db.query.taxRates.findFirst({
      where: and(eq(taxRates.id, Number(rateId)), eq(taxRates.businessId, owner.businessId)),
    });
    if (!rate) return;
    rateMilli = rate.rateMilli;
  }
  await db.update(invoices).set({ taxRateMilli: rateMilli }).where(eq(invoices.id, invoice.id));
  await refreshTotals(invoice.id);
  refresh(invoice.id);
}

export async function send(_: ActionResult, form: FormData): Promise<ActionResult> {
  const owner = await requireRole("owner");
  const invoice = await ownedInvoice(owner.businessId, Number(form.get("invoiceId")));
  if (!invoice) return { error: "Invoice not found." };
  if (invoice.status === "draft") {
    const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoice.id));
    if (lines.some((l) => l.unitCents === 0)) {
      return { error: "Price every line before sending, or remove the $0 lines." };
    }
  }
  const result = await sendInvoice(invoice.id);
  refresh(invoice.id);
  return result.ok ? { message: "Sent." } : { error: result.error };
}

const METHODS = ["cash", "check", "card", "other"];

export async function markPaid(_: ActionResult, form: FormData): Promise<ActionResult> {
  const owner = await requireRole("owner");
  const invoice = await ownedInvoice(owner.businessId, Number(form.get("invoiceId")));
  if (!invoice) return { error: "Invoice not found." };
  if (invoice.status === "paid" || invoice.status === "void") return { error: "This invoice is closed." };
  const method = String(form.get("method"));
  if (!METHODS.includes(method)) return { error: "Pick how they paid." };

  await db.transaction(async (tx) => {
    await tx.insert(payments).values({
      businessId: owner.businessId,
      invoiceId: invoice.id,
      amountCents: invoice.totalCents,
      method,
    });
    await tx
      .update(invoices)
      .set({ status: "paid", paidAt: new Date(), sentAt: invoice.sentAt ?? new Date() })
      .where(eq(invoices.id, invoice.id));
  });
  refresh(invoice.id);
  return { message: "Marked paid." };
}

export async function voidInvoice(form: FormData) {
  const owner = await requireRole("owner");
  const invoice = await ownedInvoice(owner.businessId, Number(form.get("invoiceId")));
  if (!invoice || invoice.status === "paid") return;
  await db.update(invoices).set({ status: "void" }).where(eq(invoices.id, invoice.id));
  refresh(invoice.id);
}
