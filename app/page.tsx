import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, homeFor } from "@/lib/auth";
import { signupAllowed } from "@/app/actions/auth";
import LoginForms from "@/components/LoginForms";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user.role));
  const canSignUp = await signupAllowed();

  return (
    <main className="narrow">
      <h1>Routey</h1>
      <LoginForms />
      {canSignUp && (
        <p>
          New business? <Link href="/setup">Set up your account</Link>
        </p>
      )}
    </main>
  );
}
