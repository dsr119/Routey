import { redirect } from "next/navigation";
import { signupAllowed } from "@/app/actions/auth";
import SetupForm from "@/components/SetupForm";

export const dynamic = "force-dynamic";

export default async function Setup() {
  if (!(await signupAllowed())) redirect("/");
  return (
    <main className="narrow">
      <h1>Set up your business</h1>
      <SetupForm />
    </main>
  );
}
