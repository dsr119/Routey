import Link from "next/link";
import { logout } from "@/app/actions/auth";

export default function TopBar({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  return (
    <nav className="topbar">
      <Link href={links[0]?.href ?? "/"} className="brand">
        {title}
      </Link>
      {links.map((l) => (
        <Link key={l.href} href={l.href}>
          {l.label}
        </Link>
      ))}
      <form action={logout}>
        <button className="link">Log out</button>
      </form>
    </nav>
  );
}
