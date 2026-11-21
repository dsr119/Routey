"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses, taxRates } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { geocode } from "@/lib/geocode";
import { parsePercent } from "@/lib/invoice-math";
import type { ActionResult } from "@/components/ActionForm";

function optional(form: FormData, name: string): string | null {
  return String(form.get(name) ?? "").trim() || null;
}

export async function updateBusiness(_: ActionResult, form: FormData): Promise<ActionResult> {
  const owner = await requireRole("owner");
  const biz = await db.query.businesses.findFirst({ where: eq(businesses.id, owner.businessId) });
  if (!biz) return { error: "Business not found." };
  const name = optional(form, "name");
  if (!name) return { error: "Enter the business name." };

  const changes: Partial<typeof businesses.$inferInsert> = {
    name,
    address: optional(form, "address"),
    phone: optional(form, "phone"),
    email: optional(form, "email"),
  };

  const home = optional(form, "homeAddress");
  let note = "";
  if (home !== biz.homeAddress || (home && biz.homeLat === null)) {
    const place = home ? await geocode(home) : null;
    changes.homeAddress = place?.address ?? home;
    changes.homeLat = place?.lat ?? null;
    changes.homeLng = place?.lng ?? null;
    if (home && !place) note = " The start address wasn't checked on the map, so Optimize can't use it yet.";
  }
  await db.update(businesses).set(changes).where(eq(businesses.id, biz.id));
  revalidatePath("/owner", "layout");
  return { message: "Saved." + note };
}

export async function addTaxRate(_: ActionResult, form: FormData): Promise<ActionResult> {
  const owner = await requireRole("owner");
  const name = optional(form, "name");
  const rateMilli = parsePercent(String(form.get("rate") ?? ""));
  if (!name) return { error: "Name the rate, like State sales tax." };
  if (rateMilli === null) return { error: "Enter a rate between 0 and 100, like 8 or 8.875." };
  const existing = await db.query.taxRates.findFirst({ where: eq(taxRates.businessId, owner.businessId) });
  await db.insert(taxRates).values({
    businessId: owner.businessId,
    name,
    rateMilli,
    // The first rate becomes the default.
    isDefault: !existing,
  });
  revalidatePath("/owner/settings");
  return { message: `Added ${name}.` };
}

export async function changeTaxRate(form: FormData) {
  const owner = await requireRole("owner");
  const id = Number(form.get("rateId"));
  const mine = and(eq(taxRates.id, id), eq(taxRates.businessId, owner.businessId));
  const rate = await db.query.taxRates.findFirst({ where: mine });
  if (!rate) return;
  if (form.get("change") === "default") {
    await db.transaction(async (tx) => {
      await tx.update(taxRates).set({ isDefault: false }).where(eq(taxRates.businessId, owner.businessId));
      await tx.update(taxRates).set({ isDefault: true }).where(mine);
    });
  } else if (form.get("change") === "delete") {
    // Invoices keep their own copy of the rate, so deleting one is safe.
    await db.delete(taxRates).where(mine);
  }
  revalidatePath("/owner/settings");
}

export async function updateInvoiceSettings(_: ActionResult, form: FormData): Promise<ActionResult> {
  const owner = await requireRole("owner");
  const days = Number(String(form.get("paymentTermsDays") ?? "").trim());
  if (!Number.isInteger(days) || days < 0 || days > 365) {
    return { error: "Enter the number of days clients have to pay, from 0 to 365." };
  }
  await db
    .update(businesses)
    .set({ holdInvoices: form.get("holdInvoices") === "on", paymentTermsDays: days })
    .where(eq(businesses.id, owner.businessId));
  revalidatePath("/owner/settings");
  return { message: "Saved." };
}

const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];
const LOGO_MAX_BYTES = 300 * 1024;

export async function updateLogo(_: ActionResult, form: FormData): Promise<ActionResult> {
  const owner = await requireRole("owner");
  if (form.get("remove") === "on") {
    await db.update(businesses).set({ logoUrl: null }).where(eq(businesses.id, owner.businessId));
    revalidatePath("/owner", "layout");
    return { message: "Logo removed." };
  }
  const file = form.get("logo");
  if (!(file instanceof File) || file.size === 0) return { error: "Pick an image file." };
  if (!LOGO_TYPES.includes(file.type)) return { error: "Use a PNG, JPG or WebP image." };
  if (file.size > LOGO_MAX_BYTES) return { error: "Use an image under 300 KB." };
  const data = Buffer.from(await file.arrayBuffer()).toString("base64");
  await db
    .update(businesses)
    .set({ logoUrl: `data:${file.type};base64,${data}` })
    .where(eq(businesses.id, owner.businessId));
  revalidatePath("/owner", "layout");
  return { message: "Logo saved." };
}
