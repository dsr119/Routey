import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import {
  SESSION_DAYS,
  afterFailedAttempt,
  isLocked,
  randomLoginId,
} from "./auth-rules";

const COOKIE = "routey_session";
// Compared against when no user matches, so a wrong ID takes as long as a wrong PIN.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-secret", 10);

export type Role = "owner" | "employee" | "client";
export type CurrentUser = typeof users.$inferSelect;

export function hashSecret(secret: string): Promise<string> {
  return bcrypt.hash(secret, 10);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function newLoginId(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const id = randomLoginId();
    const taken = await db.query.users.findFirst({ where: eq(users.loginId, id) });
    if (!taken) return id;
  }
  throw new Error("Could not find a free login ID");
}

export type LoginResult =
  | { ok: true; user: CurrentUser }
  | { ok: false; error: string };

// Checks a secret against a user row and records failures and lockouts.
async function checkSecret(
  user: CurrentUser | undefined,
  secret: string,
  field: "pinHash" | "passwordHash",
): Promise<LoginResult> {
  const now = new Date();
  const hash = user?.[field] ?? DUMMY_HASH;
  const match = await bcrypt.compare(secret, hash);

  if (!user || !user.active || !user[field]) {
    return { ok: false, error: "That login didn't work. Check it and try again." };
  }
  if (isLocked(user.lockedUntil, now)) {
    return {
      ok: false,
      error: "Too many wrong tries. This login is locked for 15 minutes.",
    };
  }
  if (!match) {
    await db
      .update(users)
      .set(afterFailedAttempt(user.failedAttempts, now))
      .where(eq(users.id, user.id));
    return { ok: false, error: "That login didn't work. Check it and try again." };
  }
  if (user.failedAttempts > 0 || user.lockedUntil) {
    await db
      .update(users)
      .set({ failedAttempts: 0, lockedUntil: null })
      .where(eq(users.id, user.id));
  }
  return { ok: true, user };
}

export async function loginWithPin(loginId: string, pin: string) {
  const user = await db.query.users.findFirst({ where: eq(users.loginId, loginId) });
  if (user && user.role === "owner") return checkSecret(undefined, pin, "pinHash");
  return checkSecret(user, pin, "pinHash");
}

export async function loginWithPassword(email: string, password: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.email, email.trim().toLowerCase()),
  });
  if (user && user.role !== "owner") return checkSecret(undefined, password, "passwordHash");
  return checkSecret(user, password, "passwordHash");
}

export async function startSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt });
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
  jar.delete(COOKIE);
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, new Date())));
  const user = rows[0]?.user;
  return user && user.active ? user : null;
}

export function homeFor(role: Role): string {
  return role === "owner" ? "/owner" : role === "employee" ? "/crew" : "/client";
}

// Use at the top of every protected page and server action.
export async function requireRole(role: Role): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (user.role !== role) redirect(homeFor(user.role));
  return user;
}
