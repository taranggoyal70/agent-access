"use client";

import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { IconAperture, IconBox, IconFileCertificate, IconFileText, IconFlask, IconHome, IconKey, IconShieldCheck, IconUsers } from "@tabler/icons-react";

const items = [
  [IconHome, "Overview", "/dashboard"],
  [IconBox, "Projects", "/dashboard"],
  [IconShieldCheck, "Policies", "/dashboard/policies"],
  [IconFlask, "Sandboxes", "/dashboard/sandboxes"],
  [IconUsers, "Agent accounts", "/dashboard/agents"],
  [IconFileCertificate, "Receipts", "/dashboard/receipts"],
  [IconFileText, "Audit", "/dashboard/audit"],
  [IconKey, "Credentials", "/dashboard/credentials"],
] as const;

export function AppShell({ organizationName, children }: { organizationName: string; children: React.ReactNode }) {
  const pathname = usePathname();
  return <div className="console-shell">
    <aside className="console-sidebar">
      <Link href="/dashboard" className="console-brand"><IconAperture size={24} /> <span>Agent Access</span></Link>
      <div className="org-switch"><span>{organizationName.slice(0, 2).toUpperCase()}</span><strong>{organizationName}</strong></div>
      <nav>{items.map(([Icon, label, href]) => <Link key={label} href={href} className={pathname === href || (href !== "/dashboard" && pathname.startsWith(href)) ? "console-link active" : "console-link"}><Icon size={18} /><span>{label}</span></Link>)}</nav>
      <div className="console-user"><UserButton showName /></div>
    </aside>
    <main className="console-main">{children}</main>
  </div>;
}
