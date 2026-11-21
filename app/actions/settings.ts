"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { geocode } from "@/lib/geocode";
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
