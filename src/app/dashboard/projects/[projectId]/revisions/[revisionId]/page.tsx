import { assertProjectAccess } from "@/lib/auth";
import { query } from "@/lib/db";
import { RevisionReview } from "@/components/RevisionReview";
import { notFound } from "next/navigation";

export default async function RevisionPage({ params }: { params: Promise<{ projectId: string; revisionId: string }> }) {
  const { projectId, revisionId } = await params; await assertProjectAccess(projectId);
  const rows = await query<{ revision_number: number; status: string; analysis: { warnings: string[]; changes: { added: []; removed: []; changed: []; total: number } }; created_at: string }>("SELECT revision_number,status,analysis,created_at::text FROM import_revisions WHERE id=$1 AND project_id=$2", [revisionId, projectId]);
  if (!rows[0] || rows[0].status !== "pending") notFound();
  return <div className="console-page narrow"><header className="page-header"><div><p className="kicker">Import revision · {new Date(rows[0].created_at).toLocaleString()}</p><h1>Review contract changes</h1><p>The currently published agent surface remains unchanged until you promote this revision.</p></div></header><RevisionReview projectId={projectId} revisionId={revisionId} revisionNumber={rows[0].revision_number} analysis={rows[0].analysis} /></div>;
}
