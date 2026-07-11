"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconAlertTriangle, IconCheck, IconLoader2, IconShieldCheck } from "@tabler/icons-react";

type Change = { operationId: string; level: string; reason: string };
export function RevisionReview({ projectId, revisionId, revisionNumber, analysis }: { projectId: string; revisionId: string; revisionNumber: number; analysis: { warnings: string[]; changes: { added: Change[]; removed: Change[]; changed: Change[]; total: number } } }) {
  const router = useRouter(); const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
  const changes = [...analysis.changes.added, ...analysis.changes.removed, ...analysis.changes.changed];
  async function promote() { setLoading(true); setError(null); const response = await fetch(`/api/projects/${projectId}/revisions/${revisionId}/promote`, { method: "POST" }); const result = await response.json(); if (!response.ok) { setLoading(false); return setError(result.error); } router.push(`/dashboard/projects/${projectId}`); router.refresh(); }
  return <div className="revision-review"><section className="revision-summary"><IconShieldCheck size={25} /><div><strong>Revision {revisionNumber} is isolated from the published surface</strong><p>Promotion updates the contract but never adds capabilities to existing Delegations.</p></div></section>{!!analysis.warnings.length && <div className="warning-list">{analysis.warnings.map((warning) => <p key={warning}><IconAlertTriangle size={15} />{warning}</p>)}</div>}<section className="revision-changes"><h2>{analysis.changes.total} contract changes</h2>{changes.length ? changes.map((change) => <article key={`${change.operationId}-${change.reason}`}><span className={`change-level ${change.level}`}>{change.level}</span><div><strong>{change.operationId}</strong><p>{change.reason}</p></div></article>) : <div className="no-changes"><IconCheck size={18} />No capability-level changes detected.</div>}</section>{error && <p className="form-error">{error}</p>}<footer><button className="button ghost" onClick={() => router.back()}>Keep pending</button><button className="button primary large" onClick={promote} disabled={loading}>{loading && <IconLoader2 className="spin" size={17} />}Promote reviewed revision</button></footer></div>;
}
