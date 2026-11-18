"use server";

import { redirect } from "next/navigation";
import { count } from "drizzle-orm";
import { db } from "@/db";
import { businesses, users } from "@/db/schema";
import {
  endSession,
  hashSecret,
  homeFor,
  loginWithPassword,
  loginWithPin,
  startSession,
} from "@/lib/auth";
import { isValidLoginId, isValidPassword, isValidPin } from "@/lib/auth-rules";

export type FormState = { error?: string } | undefined;

function field(form: FormData, name: string): string {
  return String(form.get(name) ?? "").trim();
}

export async function pinLogin(_: FormState, form: FormData): Promise<FormState> {
  const loginId = field(form, "loginId");
  const pin = field(form, "pin");
  if (!isValidLoginId(loginId) || !isValidPin(pin)) {
    return { error: "Your ID is 7 digits and your PIN is 6 digits." };
  }
  const result = await loginWithPin(loginId, pin);
  if (!result.ok) return { error: result.error };
  await startSession(result.user.id);
  redirect(homeFor(result.user.role));
}

export async function ownerLogin(_: FormState, form: FormData): Promise<FormState> {
  const result = await loginWithPassword(field(form, "email"), String(form.get("password") ?? ""));
  if (!result.ok) return { error: result.error };
  await startSession(result.user.id);
  redirect("/owner");
}

export async function logout() {
  await endSession();
  redirect("/");
}

export async function signupAllowed(): Promise<boolean> {
  if (process.env.ALLOW_SIGNUP === "true") return true;
  const [row] = await db.select({ n: count() }).from(businesses);
  return row.n === 0;
}

export async function createBusiness(_: FormState, form: FormData): Promise<FormState> {
  if (!(await signupAllowed())) return { error: "Sign-up is closed." };

  const businessName = field(form, "businessName");
  const name = field(form, "name");
  const email = field(form, "email").toLowerCase();
  const password = String(form.get("password") ?? "");

  if (!businessName || !name) return { error: "Fill in your name and the business name." };
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter a valid email." };
  if (!isValidPassword(password)) return { error: "Use a password of at least 8 characters." };

  const taken = await db.query.users.findFirst({ where: (u, { eq }) => eq(u.email, email) });
  if (taken) return { error: "That email already has an account." };

  const passwordHash = await hashSecret(password);
  const userId = await db.transaction(async (tx) => {
    const [biz] = await tx
      .insert(businesses)
      .values({ name: businessName, email })
      .returning({ id: businesses.id });
    const [owner] = await tx
      .insert(users)
      .values({ businessId: biz.id, role: "owner", name, email, passwordHash })
      .returning({ id: users.id });
    return owner.id;
  });

  await startSession(userId);
  redirect("/owner");
}
