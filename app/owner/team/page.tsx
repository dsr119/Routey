import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { setActive } from "@/app/actions/team";
import { AddEmployeeForm, ResetPinButton } from "@/components/TeamForms";

export default async function Team() {
  const owner = await requireRole("owner");
  const employees = await db
    .select()
    .from(users)
    .where(and(eq(users.businessId, owner.businessId), eq(users.role, "employee")))
    .orderBy(asc(users.name));

  return (
    <>
      <h1>Team</h1>
      <AddEmployeeForm />
      {employees.length === 0 ? (
        <p className="muted">No employees yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>ID</th>
              <th>Phone</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id} className={e.active ? "" : "muted"}>
                <td>
                  {e.name}
                  {!e.active && " (inactive)"}
                </td>
                <td>{e.loginId}</td>
                <td>{e.phone}</td>
                <td>
                  <div className="row">
                    <ResetPinButton userId={e.id} />
                    <form action={setActive}>
                      <input type="hidden" name="userId" value={e.id} />
                      <input type="hidden" name="active" value={String(!e.active)} />
                      <button className="link">{e.active ? "Deactivate" : "Reactivate"}</button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
