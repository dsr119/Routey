import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { crewMembers, crews, users } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { addCrew, addCrewMember, renameCrew, updateCrewMember } from "@/app/actions/crews";
import ActionForm from "@/components/ActionForm";

export default async function Crews() {
  const owner = await requireRole("owner");
  const crewList = await db
    .select()
    .from(crews)
    .where(eq(crews.businessId, owner.businessId))
    .orderBy(asc(crews.name));
  const employees = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.businessId, owner.businessId), eq(users.role, "employee"), eq(users.active, true)))
    .orderBy(asc(users.name));
  const members = crewList.length
    ? await db
        .select({
          crewId: crewMembers.crewId,
          userId: crewMembers.userId,
          isForeman: crewMembers.isForeman,
          name: users.name,
        })
        .from(crewMembers)
        .innerJoin(users, eq(crewMembers.userId, users.id))
        .where(inArray(crewMembers.crewId, crewList.map((c) => c.id)))
        .orderBy(asc(users.name))
    : [];

  return (
    <>
      <h1>Crews</h1>
      <p className="muted">
        A crew is one or more employees who work a route together. A crew can be one person.
      </p>
      {employees.length === 0 && (
        <p className="notice">
          Add employees on the <a href="/owner/team">Team</a> page first.
        </p>
      )}

      {crewList.map((crew) => {
        const list = members.filter((m) => m.crewId === crew.id);
        const free = employees.filter((e) => !list.some((m) => m.userId === e.id));
        return (
          <section key={crew.id} className="box">
            <h2 style={{ marginTop: 0 }}>{crew.name}</h2>
            {list.length === 0 && <p className="muted">Nobody on this crew yet.</p>}
            <ul>
              {list.map((m) => (
                <li key={m.userId}>
                  <span className="row">
                    <span>
                      {m.name}
                      {m.isForeman && <strong> (foreman)</strong>}
                    </span>
                    <form action={updateCrewMember}>
                      <input type="hidden" name="crewId" value={crew.id} />
                      <input type="hidden" name="userId" value={m.userId} />
                      <input type="hidden" name="change" value={m.isForeman ? "notForeman" : "foreman"} />
                      <button className="link">{m.isForeman ? "Not foreman" : "Make foreman"}</button>
                    </form>
                    <form action={updateCrewMember}>
                      <input type="hidden" name="crewId" value={crew.id} />
                      <input type="hidden" name="userId" value={m.userId} />
                      <input type="hidden" name="change" value="remove" />
                      <button className="link">Remove</button>
                    </form>
                  </span>
                </li>
              ))}
            </ul>
            {free.length > 0 && (
              <ActionForm action={addCrewMember} submit="Add to crew" className="" secondary>
                <input type="hidden" name="crewId" value={crew.id} />
                <div className="row">
                  <label style={{ flex: "1 1 200px" }}>
                    Employee
                    <select name="userId">
                      {free.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ fontWeight: 400 }}>
                    <input type="checkbox" name="isForeman" /> Foreman
                  </label>
                </div>
              </ActionForm>
            )}
            <details style={{ marginTop: 12 }}>
              <summary>Rename</summary>
              <ActionForm action={renameCrew} submit="Save" className="" keep>
                <input type="hidden" name="crewId" value={crew.id} />
                <label>
                  Name
                  <input name="name" defaultValue={crew.name} required />
                </label>
              </ActionForm>
            </details>
          </section>
        );
      })}

      <h2>Add a crew</h2>
      <ActionForm action={addCrew} submit="Add crew">
        <label>
          Crew name
          <input name="name" placeholder="Crew 1" required />
        </label>
      </ActionForm>
    </>
  );
}
