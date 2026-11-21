import { requireRole } from "@/lib/auth";
import TopBar from "@/components/TopBar";

export const dynamic = "force-dynamic";

export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireRole("employee");
  return (
    <>
      <TopBar title="Routey" links={[{ href: "/crew", label: "My route" }]} />
      <main>{children}</main>
    </>
  );
}
