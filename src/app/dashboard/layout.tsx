import { getCurrentOrganization, isCurrentUserAdmin } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const organization = await getCurrentOrganization();
  const isAdmin = await isCurrentUserAdmin();
  return <AppShell organizationName={organization.name} isAdmin={isAdmin}>{children}</AppShell>;
}
