import { eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import TopBar from "@/components/TopBar";

export const dynamic = "force-dynamic";

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("owner");
  const biz = await db.query.businesses.findFirst({ where: eq(businesses.id, user.businessId) });
  return (
    <>
      <TopBar
        title={biz?.name ?? "Routey"}
        links={[
          { href: "/owner", label: "Today" },
          { href: "/owner/clients", label: "Clients" },
          { href: "/owner/team", label: "Team" },
        ]}
      />
      <main>{children}</main>
    </>
  );
}
