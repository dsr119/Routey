import { requireRole } from "@/lib/auth";
import TopBar from "@/components/TopBar";

export const dynamic = "force-dynamic";

export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireRole("client");
  return (
    <>
      <TopBar title="Routey" links={[{ href: "/client", label: "My account" }]} />
      <main>{children}</main>
    </>
  );
}
