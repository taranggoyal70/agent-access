import { getCurrentOrganization } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const organization = await getCurrentOrganization();
  return <AppShell organizationName={organization.name}>{children}</AppShell>;
}
