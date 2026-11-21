"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { crewMembers, crews, users } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import type { ActionResult } from "@/components/ActionForm";

async function ownedCrew(businessId: number, id: number) {
  return db.query.crews.findFirst({
    where: and(eq(crews.id, id), eq(crews.businessId, businessId)),
  });
}

export async function addCrew(_: ActionResult, form: FormData): Promise<ActionResult> {
  const owner = await requireRole("owner");
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "Give the crew a name, like Crew 1 or Plow Truck 2." };
  await db.insert(crews).values({ businessId: owner.businessId, name });
  revalidatePath("/owner/crews");
  return { message: `Added ${name}.` };
}

export async function addCrewMember(_: ActionResult, form: FormData): Promise<ActionResult> {
  const owner = await requireRole("owner");
  const crew = await ownedCrew(owner.businessId, Number(form.get("crewId")));
  if (!crew) return { error: "Crew not found." };
  const employee = await db.query.users.findFirst({
    where: and(
      eq(users.id, Number(form.get("userId"))),
      eq(users.businessId, owner.businessId),
      eq(users.role, "employee"),
    ),
  });
  if (!employee) return { error: "Pick an employee." };
  await db
    .insert(crewMembers)
    .values({ crewId: crew.id, userId: employee.id, isForeman: form.get("isForeman") === "on" })
    .onConflictDoNothing();
  revalidatePath("/owner/crews");
  return undefined;
}

export async function updateCrewMember(form: FormData) {
  const owner = await requireRole("owner");
  const crew = await ownedCrew(owner.businessId, Number(form.get("crewId")));
  if (!crew) return;
  const userId = Number(form.get("userId"));
  const where = and(eq(crewMembers.crewId, crew.id), eq(crewMembers.userId, userId));
  const change = String(form.get("change"));
  if (change === "remove") await db.delete(crewMembers).where(where);
  if (change === "foreman") await db.update(crewMembers).set({ isForeman: true }).where(where);
  if (change === "notForeman") await db.update(crewMembers).set({ isForeman: false }).where(where);
  revalidatePath("/owner/crews");
}

export async function renameCrew(_: ActionResult, form: FormData): Promise<ActionResult> {
  const owner = await requireRole("owner");
  const crew = await ownedCrew(owner.businessId, Number(form.get("crewId")));
  if (!crew) return { error: "Crew not found." };
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "Enter a name." };
  await db.update(crews).set({ name }).where(eq(crews.id, crew.id));
  revalidatePath("/owner/crews");
  return { message: "Saved." };
}
