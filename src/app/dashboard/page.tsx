import Link from "next/link";
import { getCurrentOrganization } from "@/lib/auth";
import { query } from "@/lib/db";
import { IconArrowRight, IconBraces, IconPlus } from "@tabler/icons-react";

type Project = { id: string; name: string; openapi_version: string; status: string; capability_count: string; sandbox_id: string; sandbox_status: string };

export default async function DashboardPage() {
  const organization = await getCurrentOrganization();
  const metrics = await query<{ weekly_executions: string; connected_partners: string; active_partners: string; four_week_retained: string }>(
    `SELECT
      (SELECT count(*)::text FROM executions e JOIN sandboxes s ON s.id=e.sandbox_id JOIN projects p ON p.id=s.project_id WHERE p.organization_id=$1 AND e.upstream AND e.created_at >= date_trunc('week',now())) weekly_executions,
      (SELECT count(*)::text FROM vendor_connections vc JOIN projects p ON p.id=vc.project_id WHERE p.organization_id=$1 AND vc.status='active') connected_partners,
      (SELECT count(*)::text FROM (SELECT p.id FROM executions e JOIN sandboxes s ON s.id=e.sandbox_id JOIN projects p ON p.id=s.project_id WHERE p.organization_id=$1 AND e.upstream GROUP BY p.id HAVING count(DISTINCT date_trunc('week',e.created_at)) >= 2) x) active_partners,
      (SELECT count(*)::text FROM (SELECT p.id FROM executions e JOIN sandboxes s ON s.id=e.sandbox_id JOIN projects p ON p.id=s.project_id WHERE p.organization_id=$1 AND e.upstream GROUP BY p.id HAVING count(DISTINCT date_trunc('week',e.created_at)) >= 4) y) four_week_retained`, [organization.id]);
  const projects = await query<Project>(
    `SELECT p.id, p.name, p.openapi_version, p.status, count(c.id)::text capability_count,
            s.id sandbox_id, s.status sandbox_status
     FROM projects p LEFT JOIN capabilities c ON c.project_id = p.id LEFT JOIN sandboxes s ON s.project_id = p.id
     WHERE p.organization_id = $1 GROUP BY p.id, s.id ORDER BY p.created_at DESC`,
    [organization.id],
  );
  return <div className="console-page">
    <header className="page-header"><div><p className="kicker">Agent surfaces</p><h1>Turn your API into software agents can safely use.</h1><p>Import, govern, publish, and verify every machine-facing capability.</p></div><Link className="button primary" href="/dashboard/import"><IconPlus size={17} /> Import OpenAPI</Link></header>
    <section className="north-star"><div><p className="kicker">YC evidence dashboard</p><h2>Weekly verified upstream executions</h2></div><strong>{metrics[0]?.weekly_executions ?? "0"}</strong><article><span>Connected staging APIs</span><b>{metrics[0]?.connected_partners ?? "0"} / 3</b></article><article><span>Active design partners</span><b>{metrics[0]?.active_partners ?? "0"} / 3</b></article><article><span>Four-week retained</span><b>{metrics[0]?.four_week_retained ?? "0"} / 2</b></article></section>
    {projects.length ? <div className="project-list">{projects.map((project) => <article className="project-row" key={project.id}>
      <div className="project-icon"><IconBraces size={20} /></div>
      <div><h2>{project.name}</h2><p>OpenAPI {project.openapi_version} · {project.capability_count} capabilities</p></div>
      <span className={`state ${project.sandbox_status}`}>{project.sandbox_status}</span>
      <Link href={project.sandbox_status === "published" ? `/dashboard/sandboxes/${project.sandbox_id}` : `/dashboard/projects/${project.id}`}>{project.sandbox_status === "published" ? "Open verification" : "Review policies"}<IconArrowRight size={16} /></Link>
    </article>)}</div> : <section className="empty-state"><IconBraces size={30} /><h2>Publish your first agent surface</h2><p>Bring an OpenAPI 3.x document. Agent Access proposes safe defaults and creates an isolated sandbox.</p><Link className="button primary" href="/dashboard/import">Import OpenAPI</Link></section>}
  </div>;
}
