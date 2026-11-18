"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashSecret, newLoginId, requireRole } from "@/lib/auth";
import { randomPin } from "@/lib/auth-rules";

export type NewLogin = { name: string; loginId: string; pin: string } | { error: string } | undefined;

export async function addEmployee(_: NewLogin, form: FormData): Promise<NewLogin> {
  const owner = await requireRole("owner");
  const name = String(form.get("name") ?? "").trim();
  const phone = String(form.get("phone") ?? "").trim() || null;
  if (!name) return { error: "Enter a name." };

  const loginId = await newLoginId();
  const pin = randomPin();
  await db.insert(users).values({
    businessId: owner.businessId,
    role: "employee",
    name,
    phone,
    loginId,
    pinHash: await hashSecret(pin),
  });
  revalidatePath("/owner/team");
  return { name, loginId, pin };
}

export async function resetPin(_: NewLogin, form: FormData): Promise<NewLogin> {
  const owner = await requireRole("owner");
  const id = Number(form.get("userId"));
  const target = await db.query.users.findFirst({
    where: and(eq(users.id, id), eq(users.businessId, owner.businessId)),
  });
  if (!target || target.role === "owner" || !target.loginId) return { error: "User not found." };

  const pin = randomPin();
  await db
    .update(users)
    .set({ pinHash: await hashSecret(pin), failedAttempts: 0, lockedUntil: null })
    .where(eq(users.id, target.id));
  return { name: target.name, loginId: target.loginId, pin };
}

export async function setActive(form: FormData) {
  const owner = await requireRole("owner");
  const id = Number(form.get("userId"));
  const active = form.get("active") === "true";
  await db
    .update(users)
    .set({ active })
    .where(and(eq(users.id, id), eq(users.businessId, owner.businessId), eq(users.role, "employee")));
  revalidatePath("/owner/team");
}
