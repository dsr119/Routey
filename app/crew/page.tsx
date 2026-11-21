import { requireRole } from "@/lib/auth";

export default async function CrewHome() {
  const user = await requireRole("employee");
  return (
    <>
      <h1>Hi {user.name}</h1>
      <p>Your route for today will show here.</p>
    </>
  );
}
