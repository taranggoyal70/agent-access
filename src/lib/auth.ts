import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { query } from "./db";
import { slugify } from "./ids";

export type Organization = { id: string; name: string; slug: string; role: string };

export async function requireUserId() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  return userId;
}

export async function getCurrentOrganization(): Promise<Organization> {
  const userId = await requireUserId();
  const existing = await query<Organization>(
    `SELECT o.id, o.name, o.slug, m.role
     FROM memberships m JOIN organizations o ON o.id = m.organization_id
     WHERE m.clerk_user_id = $1 ORDER BY o.created_at LIMIT 1`,
    [userId],
  );
  if (existing[0]) return existing[0];

  const slug = slugify(`workspace-${userId.slice(-10)}`);
  const created = await query<{ id: string; name: string; slug: string }>(
    `INSERT INTO organizations (owner_clerk_id, name, slug)
     VALUES ($1, 'My agent workspace', $2)
     ON CONFLICT (owner_clerk_id) DO UPDATE SET updated_at = now()
     RETURNING id, name, slug`,
    [userId, slug],
  );
  await query(
    `INSERT INTO memberships (organization_id, clerk_user_id, role)
     VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING`,
    [created[0].id, userId],
  );
  return { ...created[0], role: "owner" };
}

export async function assertProjectAccess(projectId: string) {
  const organization = await getCurrentOrganization();
  const rows = await query<{ id: string }>("SELECT id FROM projects WHERE id = $1 AND organization_id = $2", [projectId, organization.id]);
  if (!rows[0]) throw new Error("Project not found");
  return organization;
}

export async function isCurrentUserAdmin() {
  const { userId } = await auth();
  return !!userId && !!process.env.ADMIN_CLERK_USER_ID && userId === process.env.ADMIN_CLERK_USER_ID;
}

export async function requireAdminUserId() {
  const userId = await requireUserId();
  if (!process.env.ADMIN_CLERK_USER_ID || userId !== process.env.ADMIN_CLERK_USER_ID) notFound();
  return userId;
}
