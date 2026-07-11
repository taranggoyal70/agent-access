import Link from "next/link";
import { getCurrentOrganization } from "@/lib/auth";
import { query } from "@/lib/db";
import { IconArrowRight, IconBraces, IconPlus } from "@tabler/icons-react";

type Project = { id: string; name: string; openapi_version: string; status: string; capability_count: string; sandbox_id: string; sandbox_status: string };

export default async function DashboardPage() {
  const organization = await getCurrentOrganization();
  const projects = await query<Project>(
    `SELECT p.id, p.name, p.openapi_version, p.status, count(c.id)::text capability_count,
            s.id sandbox_id, s.status sandbox_status
     FROM projects p LEFT JOIN capabilities c ON c.project_id = p.id LEFT JOIN sandboxes s ON s.project_id = p.id
     WHERE p.organization_id = $1 GROUP BY p.id, s.id ORDER BY p.created_at DESC`,
    [organization.id],
  );
  return <div className="console-page">
    <header className="page-header"><div><p className="kicker">Agent surfaces</p><h1>Turn your API into software agents can safely use.</h1><p>Import, govern, publish, and verify every machine-facing capability.</p></div><Link className="button primary" href="/dashboard/import"><IconPlus size={17} /> Import OpenAPI</Link></header>
    {projects.length ? <div className="project-list">{projects.map((project) => <article className="project-row" key={project.id}>
      <div className="project-icon"><IconBraces size={20} /></div>
      <div><h2>{project.name}</h2><p>OpenAPI {project.openapi_version} · {project.capability_count} capabilities</p></div>
      <span className={`state ${project.sandbox_status}`}>{project.sandbox_status}</span>
      <Link href={project.sandbox_status === "published" ? `/dashboard/sandboxes/${project.sandbox_id}` : `/dashboard/projects/${project.id}`}>{project.sandbox_status === "published" ? "Open verification" : "Review policies"}<IconArrowRight size={16} /></Link>
    </article>)}</div> : <section className="empty-state"><IconBraces size={30} /><h2>Publish your first agent surface</h2><p>Bring an OpenAPI 3.x document. Agent Access proposes safe defaults and creates an isolated sandbox.</p><Link className="button primary" href="/dashboard/import">Import OpenAPI</Link></section>}
  </div>;
}
