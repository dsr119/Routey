import { eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { updateBusiness } from "@/app/actions/settings";
import ActionForm from "@/components/ActionForm";

export default async function Settings() {
  const owner = await requireRole("owner");
  const biz = await db.query.businesses.findFirst({ where: eq(businesses.id, owner.businessId) });
  if (!biz) return null;

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
    </>
  );
}
