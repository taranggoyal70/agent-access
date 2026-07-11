"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { IconAlertTriangle, IconCheck, IconCircleKey, IconLoader2, IconShieldCheck } from "@tabler/icons-react";

type Policy = "read_only" | "reversible" | "approval_required" | "prohibited";
type Capability = { id: string; operation_id: string; method: string; path: string; summary: string; policy: Policy; scope: string; enabled: boolean; input_schema: Record<string, unknown> };
const labels: Record<Policy, string> = { read_only: "Read only", reversible: "Reversible", approval_required: "Approval required", prohibited: "Prohibited" };

export function CapabilityEditor({ projectId, sandboxId, capabilities, shadowMode = false }: { projectId: string; sandboxId: string; capabilities: Capability[]; shadowMode?: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState(capabilities);
  const [selectedId, setSelectedId] = useState(capabilities[0]?.id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const ready = useMemo(() => items.filter((item) => item.enabled && item.policy !== "prohibited").length, [items]);

  function updateSelected(patch: Partial<Capability>) { setItems((current) => current.map((item) => item.id === selected.id ? { ...item, ...patch } : item)); }
  async function publish() {
    setSaving(true); setError(null);
    const save = await fetch(`/api/projects/${projectId}/capabilities`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ updates: items.map(({ id, policy, enabled }) => ({ id, policy, enabled })) }) });
    if (!save.ok) { const result = await save.json(); setError(result.error); setSaving(false); return; }
    const response = await fetch(`/api/projects/${projectId}/publish`, { method: "POST" });
    const result = await response.json(); setSaving(false);
    if (!response.ok) return setError(result.error);
    router.push(`/dashboard/sandboxes/${sandboxId}`); router.refresh();
  }

  return <div className="policy-workbench">
    <section className="capability-list"><div className="section-heading"><h2>Imported capabilities</h2><span>{items.length}</span></div>{items.map((item) => <button key={item.id} className={item.id === selected.id ? "capability-item selected" : "capability-item"} onClick={() => setSelectedId(item.id)}><span className={`method ${item.method.toLowerCase()}`}>{item.method}</span><span><strong>{item.operation_id}</strong><small>{item.path}</small></span><i className={`policy-dot ${item.policy}`} /></button>)}</section>
    <section className="contract-view"><p className="kicker">{selected.method} {selected.path}</p><h2>{selected.operation_id}</h2><p>{selected.summary}</p><div className="contract-block"><label>Scope</label><code>{selected.scope}</code></div><div className="contract-block"><label>Input schema</label><pre>{JSON.stringify(selected.input_schema, null, 2)}</pre></div></section>
    <section className="policy-panel"><h2>Capability policy</h2><p>{shadowMode ? "Shadow Mode permits only GET and HEAD operations against staging." : "Define how external agents may use this operation."}</p><div className="policy-options">{(Object.keys(labels) as Policy[]).map((policy) => <button key={policy} disabled={shadowMode && selected.method !== "GET" && selected.method !== "HEAD"} className={selected.policy === policy ? `policy-option active ${policy}` : `policy-option ${policy}`} onClick={() => updateSelected({ policy })}><span>{policy === "read_only" ? <IconCheck /> : policy === "approval_required" ? <IconCircleKey /> : policy === "prohibited" ? <IconAlertTriangle /> : <IconShieldCheck />}</span><strong>{labels[policy]}</strong><small>{policy === "read_only" ? "No state changes" : policy === "reversible" ? "Writes with a recovery path" : policy === "approval_required" ? "Principal approval before use" : "Unavailable to agents"}</small></button>)}</div><label className="enable-toggle"><input type="checkbox" checked={selected.enabled} disabled={shadowMode && selected.method !== "GET" && selected.method !== "HEAD"} onChange={(event) => updateSelected({ enabled: event.target.checked })} /> {shadowMode && selected.method !== "GET" && selected.method !== "HEAD" ? "Disabled by Shadow Mode" : "Include in sandbox"}</label></section>
    <footer className="policy-footer"><div><strong>{ready} of {items.length} capabilities ready</strong><span>Machine surfaces: MCP · REST · discovery</span></div>{error && <p className="form-error">{error}</p>}<button className="button primary large" onClick={publish} disabled={saving || ready === 0}>{saving && <IconLoader2 className="spin" size={17} />}Publish agent sandbox</button></footer>
  </div>;
}
