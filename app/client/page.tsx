import { requireRole } from "@/lib/auth";

export default async function ClientHome() {
  const user = await requireRole("client");
  return (
    <>
      <h1>Hi {user.name}</h1>
      <p>Your service status and invoices will show here.</p>
    </>
  );
}
