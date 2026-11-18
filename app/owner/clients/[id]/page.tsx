import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { clients, jobs, properties, users } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { hasMapsKey } from "@/lib/geocode";
import { formatCents } from "@/lib/money";
import {
  addJob,
  addProperty,
  clientLogin,
  updateClient,
  updateJob,
  updateProperty,
} from "@/app/actions/clients";
import ActionForm from "@/components/ActionForm";
import { ClientFields, FREQUENCY_LABELS, JobFields } from "@/components/Fields";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const owner = await requireRole("owner");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  const client = await db.query.clients.findFirst({
    where: and(eq(clients.id, id), eq(clients.businessId, owner.businessId)),
  });
  if (!client) notFound();

  const props = await db
    .select()
    .from(properties)
    .where(eq(properties.clientId, client.id))
    .orderBy(asc(properties.id));
  const propJobs = props.length
    ? await db
        .select()
        .from(jobs)
        .where(inArray(jobs.propertyId, props.map((p) => p.id)))
        .orderBy(asc(jobs.id))
    : [];
  const login = await db.query.users.findFirst({ where: eq(users.clientId, client.id) });
  const mapsOn = hasMapsKey();

  return (
    <>
      <p>
        <Link href="/owner/clients">← Clients</Link>
      </p>
      <h1>{client.name}</h1>

      <h2>Properties</h2>
      {props.length === 0 && <p className="muted">No properties yet. Add one below.</p>}
      {props.map((p) => {
        const list = propJobs.filter((j) => j.propertyId === p.id);
        return (
          <section key={p.id} className="box">
            <strong>{p.address}</strong>
            {p.lat === null && mapsOn && (
              <span className="error"> (not found on the map, check the address)</span>
            )}
            {p.description && <p style={{ whiteSpace: "pre-wrap" }}>{p.description}</p>}

            {list.length > 0 && (
              <table style={{ margin: "12px 0" }}>
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>How often</th>
                    <th>Price</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((j) => (
                    <tr key={j.id} className={j.active ? "" : "muted"}>
                      <td>
                        {j.service}
                        {j.urgent && <strong className="error"> Urgent</strong>}
                        {!j.active && " (inactive)"}
                        {j.estimatedMinutes ? (
                          <div className="muted">About {j.estimatedMinutes} min</div>
                        ) : null}
                      </td>
                      <td>{FREQUENCY_LABELS[j.frequency]}</td>
                      <td>
                        {formatCents(j.priceCents)}
                        {!j.taxable && <div className="muted">No tax</div>}
                      </td>
                      <td>
                        <details>
                          <summary>Edit</summary>
                          <ActionForm action={updateJob} submit="Save" keep className="">
                            <input type="hidden" name="jobId" value={j.id} />
                            <JobFields j={j} editing />
                          </ActionForm>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <details>
              <summary>Add a service</summary>
              <ActionForm action={addJob} submit="Add service" className="">
                <input type="hidden" name="propertyId" value={p.id} />
                <JobFields />
              </ActionForm>
            </details>
            <details>
              <summary>Edit property</summary>
              <ActionForm action={updateProperty} submit="Save" keep className="">
                <input type="hidden" name="propertyId" value={p.id} />
                <label>
                  Address
                  <input name="address" defaultValue={p.address} required />
                </label>
                <label>
                  What the work involves
                  <textarea name="description" rows={3} defaultValue={p.description ?? ""} />
                </label>
              </ActionForm>
            </details>
          </section>
        );
      })}

      <details className="box">
        <summary>Add a property</summary>
        <ActionForm action={addProperty} submit="Add property" className="">
          <input type="hidden" name="clientId" value={client.id} />
          <label>
            Address
            <input name="address" placeholder="123 Main St, Springfield" required />
          </label>
          <label>
            What the work involves <span className="hint">(the crew sees this)</span>
            <textarea name="description" rows={3} />
          </label>
        </ActionForm>
        {!mapsOn && (
          <p className="muted">
            Address checking is off until a Google Maps key is added. Addresses are saved as typed.
          </p>
        )}
      </details>

      <h2>Client login</h2>
      <ActionForm action={clientLogin} submit={login ? "Give a new PIN" : "Create login"} keep secondary>
        <input type="hidden" name="clientId" value={client.id} />
        <p style={{ marginTop: 0 }}>
          {login
            ? `ID ${login.loginId}. The client uses this to check how far away the crew is and pay invoices.`
            : "No login yet. With one, the client can check how far away the crew is and pay invoices."}
        </p>
      </ActionForm>

      <h2>Contact details</h2>
      <ActionForm action={updateClient} submit="Save" keep>
        <input type="hidden" name="clientId" value={client.id} />
        <ClientFields c={client} />
      </ActionForm>
    </>
  );
}
