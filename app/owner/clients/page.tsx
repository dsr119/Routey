import Link from "next/link";
import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { clients, properties } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { addClient } from "@/app/actions/clients";
import ActionForm from "@/components/ActionForm";
import { ClientFields } from "@/components/Fields";

export default async function Clients({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const owner = await requireRole("owner");
  const q = (await searchParams).q?.trim() ?? "";

  const match = q
    ? or(
        ilike(clients.name, `%${q}%`),
        ilike(clients.phone, `%${q}%`),
        ilike(clients.email, `%${q}%`),
        sql`exists (select 1 from ${properties} where ${properties.clientId} = ${clients.id} and ${properties.address} ilike ${`%${q}%`})`,
      )
    : undefined;

  const rows = await db
    .select({
      id: clients.id,
      name: clients.name,
      phone: clients.phone,
      active: clients.active,
      address: sql<string | null>`(select ${properties.address} from ${properties} where ${properties.clientId} = ${clients.id} order by ${properties.id} limit 1)`,
      propertyCount: sql<number>`(select count(*)::int from ${properties} where ${properties.clientId} = ${clients.id})`,
    })
    .from(clients)
    .where(and(eq(clients.businessId, owner.businessId), match))
    .orderBy(asc(clients.name));

  return (
    <>
      <h1>Clients</h1>
      <form className="row" style={{ marginBottom: 16 }}>
        <input name="q" defaultValue={q} placeholder="Search name, phone, email or address" style={{ flex: 1, marginTop: 0 }} />
        <button className="secondary">Search</button>
      </form>

      {rows.length === 0 ? (
        <p className="muted">{q ? "No clients match that." : "No clients yet. Add your first one below."}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Address</th>
              <th>Phone</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className={c.active ? "" : "muted"}>
                <td>
                  <Link href={`/owner/clients/${c.id}`}>{c.name}</Link>
                </td>
                <td>
                  {c.address ?? <span className="muted">No property yet</span>}
                  {c.propertyCount > 1 && <span className="muted"> +{c.propertyCount - 1} more</span>}
                </td>
                <td>{c.phone}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Add a client</h2>
      <ActionForm action={addClient} submit="Add client">
        <ClientFields />
      </ActionForm>
    </>
  );
}
