"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, jobs, properties, users } from "@/db/schema";
import { hashSecret, newLoginId, requireRole } from "@/lib/auth";
import { randomPin } from "@/lib/auth-rules";
import { geocode } from "@/lib/geocode";
import { parseDollars } from "@/lib/money";
import type { ActionResult } from "@/components/ActionForm";

const FREQUENCIES = ["one_time", "weekly", "biweekly", "per_storm"] as const;
type Frequency = (typeof FREQUENCIES)[number];

function text(form: FormData, name: string): string {
  return String(form.get(name) ?? "").trim();
}
function optional(form: FormData, name: string): string | null {
  return text(form, name) || null;
}

async function ownedClient(businessId: number, id: number) {
  return db.query.clients.findFirst({
    where: and(eq(clients.id, id), eq(clients.businessId, businessId)),
  });
}
async function ownedProperty(businessId: number, id: number) {
  return db.query.properties.findFirst({
    where: and(eq(properties.id, id), eq(properties.businessId, businessId)),
  });
}

function clientFields(form: FormData) {
  return {
    name: text(form, "name"),
    email: optional(form, "email")?.toLowerCase() ?? null,
    phone: optional(form, "phone"),
    billingAddress: optional(form, "billingAddress"),
    notes: optional(form, "notes"),
  };
}

export async function addClient(_: ActionResult, form: FormData): Promise<ActionResult> {
  const owner = await requireRole("owner");
  const fields = clientFields(form);
  if (!fields.name) return { error: "Enter the client's name." };
  const [row] = await db
    .insert(clients)
    .values({ ...fields, businessId: owner.businessId })
    .returning({ id: clients.id });
  redirect(`/owner/clients/${row.id}`);
}

export async function updateClient(_: ActionResult, form: FormData): Promise<ActionResult> {
  const owner = await requireRole("owner");
  const client = await ownedClient(owner.businessId, Number(form.get("clientId")));
  if (!client) return { error: "Client not found." };
  const fields = clientFields(form);
  if (!fields.name) return { error: "Enter the client's name." };
  await db.update(clients).set(fields).where(eq(clients.id, client.id));
  revalidatePath(`/owner/clients/${client.id}`);
  return { message: "Saved." };
}

export async function addProperty(_: ActionResult, form: FormData): Promise<ActionResult> {
  const owner = await requireRole("owner");
  const client = await ownedClient(owner.businessId, Number(form.get("clientId")));
  if (!client) return { error: "Client not found." };
  const typed = text(form, "address");
  if (!typed) return { error: "Enter the property address." };

  const place = await geocode(typed);
  await db.insert(properties).values({
    businessId: owner.businessId,
    clientId: client.id,
    address: place?.address ?? typed,
    lat: place?.lat ?? null,
    lng: place?.lng ?? null,
    description: optional(form, "description"),
  });
  revalidatePath(`/owner/clients/${client.id}`);
  return {
    message: place
      ? `Added ${place.address}.`
      : "Added. The address wasn't checked on the map, so it can't be used for route optimizing yet.",
  };
}

export async function updateProperty(_: ActionResult, form: FormData): Promise<ActionResult> {
  const owner = await requireRole("owner");
  const property = await ownedProperty(owner.businessId, Number(form.get("propertyId")));
  if (!property) return { error: "Property not found." };
  const typed = text(form, "address");
  if (!typed) return { error: "Enter the property address." };

  const changes: Partial<typeof properties.$inferInsert> = {
    description: optional(form, "description"),
  };
  if (typed !== property.address || property.lat === null) {
    const place = await geocode(typed);
    changes.address = place?.address ?? typed;
    changes.lat = place?.lat ?? null;
    changes.lng = place?.lng ?? null;
  }
  await db.update(properties).set(changes).where(eq(properties.id, property.id));
  revalidatePath(`/owner/clients/${property.clientId}`);
  return { message: "Saved." };
}

function jobFields(form: FormData): { error: string } | Omit<typeof jobs.$inferInsert, "businessId" | "propertyId"> {
  const service = text(form, "service");
  if (!service) return { error: "Enter the service, like Mowing or Plowing." };
  const priceCents = parseDollars(text(form, "price"));
  if (priceCents === null) return { error: "Enter a price, like 45 or 45.50." };
  const frequency = text(form, "frequency") as Frequency;
  if (!FREQUENCIES.includes(frequency)) return { error: "Pick how often." };
  const minutesText = text(form, "estimatedMinutes");
  const estimatedMinutes = minutesText ? Number(minutesText) : null;
  if (estimatedMinutes !== null && (!Number.isInteger(estimatedMinutes) || estimatedMinutes < 0)) {
    return { error: "Estimated time should be a whole number of minutes." };
  }
  return {
    service,
    priceCents,
    frequency,
    estimatedMinutes,
    taxable: form.get("taxable") === "on",
    urgent: form.get("urgent") === "on",
  };
}

export async function addJob(_: ActionResult, form: FormData): Promise<ActionResult> {
  const owner = await requireRole("owner");
  const property = await ownedProperty(owner.businessId, Number(form.get("propertyId")));
  if (!property) return { error: "Property not found." };
  const fields = jobFields(form);
  if ("error" in fields) return fields;
  await db
    .insert(jobs)
    .values({ ...fields, businessId: owner.businessId, propertyId: property.id });
  revalidatePath(`/owner/clients/${property.clientId}`);
  return { message: `Added ${fields.service}.` };
}

export async function updateJob(_: ActionResult, form: FormData): Promise<ActionResult> {
  const owner = await requireRole("owner");
  const job = await db.query.jobs.findFirst({
    where: and(eq(jobs.id, Number(form.get("jobId"))), eq(jobs.businessId, owner.businessId)),
  });
  if (!job) return { error: "Job not found." };
  const fields = jobFields(form);
  if ("error" in fields) return fields;
  await db
    .update(jobs)
    .set({ ...fields, active: form.get("active") === "on" })
    .where(eq(jobs.id, job.id));
  const property = await ownedProperty(owner.businessId, job.propertyId);
  revalidatePath(`/owner/clients/${property?.clientId}`);
  return { message: "Saved." };
}

// Creates the client's login, or gives them a new PIN if they already have one.
export async function clientLogin(_: ActionResult, form: FormData): Promise<ActionResult> {
  const owner = await requireRole("owner");
  const client = await ownedClient(owner.businessId, Number(form.get("clientId")));
  if (!client) return { error: "Client not found." };

  const pin = randomPin();
  const pinHash = await hashSecret(pin);
  const existing = await db.query.users.findFirst({ where: eq(users.clientId, client.id) });
  let loginId: string;
  if (existing?.loginId) {
    loginId = existing.loginId;
    await db
      .update(users)
      .set({ pinHash, failedAttempts: 0, lockedUntil: null, active: true })
      .where(eq(users.id, existing.id));
  } else {
    loginId = await newLoginId();
    await db.insert(users).values({
      businessId: owner.businessId,
      role: "client",
      name: client.name,
      email: null,
      phone: client.phone,
      loginId,
      pinHash,
      clientId: client.id,
    });
  }
  revalidatePath(`/owner/clients/${client.id}`);
  return {
    message: `Login for ${client.name}: ID ${loginId}, PIN ${pin}. Give these to the client now. The PIN won't be shown again.`,
  };
}
