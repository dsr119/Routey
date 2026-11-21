import { requireRole } from "@/lib/auth";

export default async function OwnerHome() {
  const user = await requireRole("owner");
  return (
    <>
      <h1>Today</h1>
      <p>Hi {user.name}. Routes, crews and invoices will show up here as they are built.</p>
      <p>
        Start by adding your employees on the <a href="/owner/team">Team</a> page.
      </p>
    </>
  );
}
