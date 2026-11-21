import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses, taxRates } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { formatPercent } from "@/lib/invoice-math";
import {
  addTaxRate,
  changeTaxRate,
  updateBusiness,
  updateInvoiceSettings,
  updateLogo,
} from "@/app/actions/settings";
import ActionForm from "@/components/ActionForm";

export default async function Settings() {
  const owner = await requireRole("owner");
  const biz = await db.query.businesses.findFirst({ where: eq(businesses.id, owner.businessId) });
  if (!biz) return null;
  const rates = await db
    .select()
    .from(taxRates)
    .where(eq(taxRates.businessId, owner.businessId))
    .orderBy(asc(taxRates.name));

  return (
    <>
      <h1>Settings</h1>
      <h2>Business</h2>
      <ActionForm action={updateBusiness} submit="Save" keep>
        <label>
          Business name
          <input name="name" defaultValue={biz.name} required />
        </label>
        <label>
          Mailing address <span className="hint">(shown on invoices)</span>
          <input name="address" defaultValue={biz.address ?? ""} />
        </label>
        <div className="row">
          <label style={{ flex: "1 1 160px" }}>
            Phone
            <input name="phone" type="tel" defaultValue={biz.phone ?? ""} />
          </label>
          <label style={{ flex: "1 1 220px" }}>
            Email
            <input name="email" type="email" defaultValue={biz.email ?? ""} />
          </label>
        </div>
        <label>
          Where routes start and end <span className="hint">(usually the shop or yard)</span>
          <input name="homeAddress" defaultValue={biz.homeAddress ?? ""} />
        </label>
      </ActionForm>

      <h2>Logo</h2>
      <ActionForm action={updateLogo} submit="Save logo" keep>
        {biz.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={biz.logoUrl} alt="Current logo" style={{ maxHeight: 80, maxWidth: 240, display: "block", marginBottom: 12 }} />
        )}
        <label>
          Image <span className="hint">(PNG, JPG or WebP under 300 KB, shown on invoices)</span>
          <input type="file" name="logo" accept="image/png,image/jpeg,image/webp" />
        </label>
        {biz.logoUrl && (
          <label style={{ fontWeight: 400 }}>
            <input type="checkbox" name="remove" /> Remove the logo
          </label>
        )}
      </ActionForm>

      <h2>Sales tax</h2>
      <p className="muted">
        Add the rates you charge. The default goes on new invoices, and you can pick a different one on
        any unsent invoice. Each service can be marked taxable or not.
      </p>
      {rates.length > 0 && (
        <table style={{ marginBottom: 16 }}>
          <tbody>
            {rates.map((r) => (
              <tr key={r.id}>
                <td>
                  {r.name}
                  {r.isDefault && <strong> (default)</strong>}
                </td>
                <td>{formatPercent(r.rateMilli)}</td>
                <td>
                  <div className="row">
                    {!r.isDefault && (
                      <form action={changeTaxRate}>
                        <input type="hidden" name="rateId" value={r.id} />
                        <input type="hidden" name="change" value="default" />
                        <button className="link">Make default</button>
                      </form>
                    )}
                    <form action={changeTaxRate}>
                      <input type="hidden" name="rateId" value={r.id} />
                      <input type="hidden" name="change" value="delete" />
                      <button className="link">Delete</button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <ActionForm action={addTaxRate} submit="Add rate">
        <div className="row">
          <label style={{ flex: "2 1 200px" }}>
            Name
            <input name="name" placeholder="Sales tax" required />
          </label>
          <label style={{ flex: "1 1 100px" }}>
            Rate %
            <input name="rate" inputMode="decimal" placeholder="8.875" required />
          </label>
        </div>
      </ActionForm>

      <h2>Invoices</h2>
      <ActionForm action={updateInvoiceSettings} submit="Save" keep>
        <label style={{ maxWidth: 260 }}>
          Days to pay <span className="hint">(after an invoice goes out)</span>
          <input name="paymentTermsDays" inputMode="numeric" defaultValue={biz.paymentTermsDays} required />
        </label>
        <label style={{ fontWeight: 400 }}>
          <input type="checkbox" name="holdInvoices" defaultChecked={biz.holdInvoices} /> Hold every
          invoice for me to look over before it goes out
        </label>
        <p className="muted" style={{ marginTop: 0 }}>
          When this is off, a client&apos;s invoice goes out as soon as the crew marks the stop Done. Invoices
          with extra work always wait for you to price them.
        </p>
      </ActionForm>
    </>
  );
}
