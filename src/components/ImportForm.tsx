"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconAlertTriangle, IconCheck, IconFile, IconFileUpload, IconLink, IconLoader2, IconLock, IconRefresh, IconShieldCheck } from "@tabler/icons-react";

type SourceType = "url" | "file" | "paste" | "sample";
type Preflight = {
  title: string;
  version: string;
  baseUrl: string | null;
  specHash: string;
  capabilities: { operationId: string; method: string; path: string; summary: string; policy: string; scope: string }[];
  analysis: {
    operationCount: number;
    risk: Record<string, number>;
    references: { total: number; resolvedLocal: number; unresolvedLocal: number; external: number };
    securitySchemes: string[];
    warnings: string[];
    changes: { total: number; added: { operationId: string; level: string; reason: string }[]; removed: { operationId: string; level: string; reason: string }[]; changed: { operationId: string; level: string; reason: string }[] };
    ready: boolean;
    originSafety: { safe: boolean; message: string };
  };
};

export function ImportForm({ projectId }: { projectId?: string }) {
  const router = useRouter();
  const [sourceType, setSourceType] = useState<SourceType>("url");
  const [source, setSource] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceToken, setSourceToken] = useState("");
  const [fileName, setFileName] = useState("");
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [origin, setOrigin] = useState("");
  const [authType, setAuthType] = useState<"none" | "bearer" | "api_key">("none");
  const [headerName, setHeaderName] = useState("X-API-Key");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState<"preflight" | "confirm" | null>(null);

  function payload() { return { sourceType, source, sourceUrl, sourceToken, projectId }; }
  function choose(type: SourceType) { setSourceType(type); setPreflight(null); setError(null); setNotice(null); }

  async function runPreflight(type: SourceType = sourceType) {
    setLoading("preflight"); setError(null); setNotice(null);
    const response = await fetch("/api/imports/preflight", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload(), sourceType: type }) });
    const result = await response.json(); setLoading(null);
    if (!response.ok) return setError(result.error ?? "Preflight failed");
    setSourceType(type); setPreflight(result); setOrigin(result.baseUrl ?? "");
  }

  async function confirm() {
    if (!preflight) return;
    setLoading("confirm"); setError(null); setNotice(null);
    const connection = origin.trim() ? { origin: origin.trim(), authType, headerName: authType === "api_key" ? headerName : undefined, secret: authType === "none" ? undefined : secret } : undefined;
    const response = await fetch("/api/projects/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload(), expectedHash: preflight.specHash, connection }) });
    const result = await response.json();
    if (!response.ok) { setLoading(null); return setError(result.error ?? "Import confirmation failed"); }
    if (projectId) { setLoading(null); setNotice("Revision saved for review. The published surface has not changed."); router.refresh(); return; }
    if (connection) {
      const test = await fetch(`/api/projects/${result.projectId}/connection/test`, { method: "POST" });
      const tested = await test.json();
      if (!test.ok) { setLoading(null); setNotice(`Import created, but staging connection needs attention: ${tested.error}`); router.push(`/dashboard/projects/${result.projectId}`); return; }
    }
    router.push(`/dashboard/projects/${result.projectId}`); router.refresh();
  }

  return <div className="preflight-shell">
    <section className="import-main">
      <div className="source-tabs" role="tablist">
        <button className={sourceType === "url" ? "active" : ""} onClick={() => choose("url")}><IconLink size={16} /> HTTPS URL</button>
        <button className={sourceType === "file" ? "active" : ""} onClick={() => choose("file")}><IconFile size={16} /> Upload</button>
        <button className={sourceType === "paste" ? "active" : ""} onClick={() => choose("paste")}><IconFileUpload size={16} /> Paste</button>
      </div>

      {sourceType === "url" && <div className="source-panel"><label>OpenAPI document URL<input type="url" value={sourceUrl} onChange={(event) => { setSourceUrl(event.target.value); setPreflight(null); }} placeholder="https://api.example.com/openapi.json" /></label><label>Optional bearer token<span>Used once for this import and never persisted.</span><input type="password" value={sourceToken} onChange={(event) => setSourceToken(event.target.value)} placeholder="Private specification token" autoComplete="off" /></label></div>}
      {sourceType === "file" && <div className="dropzone"><IconFileUpload size={28} /><h2>{fileName || "Choose an OpenAPI file"}</h2><p>JSON or YAML · OpenAPI 3.x · Maximum 1 MB</p><input aria-label="Upload OpenAPI file" type="file" accept=".json,.yaml,.yml,application/json,text/yaml" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 1_000_000) return setError("OpenAPI document must be smaller than 1 MB"); setSource(await file.text()); setFileName(file.name); setPreflight(null); }} /></div>}
      {sourceType === "paste" && <textarea aria-label="OpenAPI document" value={source} onChange={(event) => { setSource(event.target.value); setPreflight(null); }} placeholder={'openapi: 3.1.0\ninfo:\n  title: My API\n  version: 1.0.0\npaths: ...'} />}

      {!preflight && <div className="form-actions split"><button className="button ghost" type="button" disabled={!!loading} onClick={() => runPreflight("sample")}>Use realistic sample</button><button className="button primary" type="button" disabled={!!loading || (sourceType === "url" ? !sourceUrl.trim() : !source.trim())} onClick={() => runPreflight()}>{loading === "preflight" ? <IconLoader2 className="spin" size={17} /> : <IconShieldCheck size={17} />}Run secure preflight</button></div>}

      {error && <p className="form-error">{error}</p>}
      {notice && <p className="form-notice"><IconCheck size={16} /> {notice}</p>}

      {preflight && <PreflightReport result={preflight} />}

      {preflight && <section className="connection-setup">
        <div className="section-heading-line"><div><p className="kicker">Vendor Connection</p><h2>Connect staging in read-only shadow mode</h2><p>The upstream credential is encrypted server-side and never given to an agent.</p></div><IconLock size={24} /></div>
        <label>Approved staging base URL<input type="url" value={origin} onChange={(event) => setOrigin(event.target.value)} placeholder="https://staging-api.example.com/v1" /></label>
        <div className="connection-grid"><label>Authentication<select value={authType} onChange={(event) => setAuthType(event.target.value as typeof authType)}><option value="none">No authentication</option><option value="bearer">Bearer token</option><option value="api_key">API key header</option></select></label>{authType === "api_key" && <label>Header name<input value={headerName} onChange={(event) => setHeaderName(event.target.value)} /></label>}{authType !== "none" && <label className="secret-field">Staging credential<input type="password" value={secret} onChange={(event) => setSecret(event.target.value)} autoComplete="new-password" placeholder="Stored encrypted; shown only here" /></label>}</div>
        <div className="shadow-guardrail"><IconShieldCheck size={18} /><div><strong>Shadow Mode guardrail</strong><span>Only reviewed GET and HEAD capabilities can reach staging. Writes remain disabled.</span></div></div>
        <div className="form-actions"><button className="button ghost" type="button" onClick={() => setPreflight(null)} disabled={!!loading}><IconRefresh size={16} />Change source</button><button className="button primary large" type="button" onClick={confirm} disabled={!!loading || !preflight.analysis.ready || (!!origin && authType !== "none" && !secret.trim())}>{loading === "confirm" && <IconLoader2 className="spin" size={17} />}{projectId ? "Save revision for review" : "Confirm and create surface"}</button></div>
      </section>}
    </section>
    <aside className="import-aside"><h2>Design-partner readiness</h2><ol><li><span>1</span>Preflight validates the contract without publishing it.</li><li><span>2</span>Only reviewed read capabilities can reach staging.</li><li><span>3</span>Agents receive delegated credentials, never the vendor secret.</li><li><span>4</span>Upstream results produce signed, redacted receipts.</li></ol><div className="aside-rule"><strong>Nothing expands automatically</strong><p>New revisions cannot add authority to an existing agent delegation.</p></div></aside>
  </div>;
}

function PreflightReport({ result }: { result: Preflight }) {
  const changes = [...result.analysis.changes.added, ...result.analysis.changes.removed, ...result.analysis.changes.changed];
  return <section className="preflight-report"><header><div><p className="kicker">Preflight complete</p><h2>{result.title}</h2><p>OpenAPI {result.version} · {result.analysis.operationCount} operations</p></div><span className={result.analysis.ready ? "preflight-ready" : "preflight-blocked"}>{result.analysis.ready ? <IconCheck size={15} /> : <IconAlertTriangle size={15} />}{result.analysis.ready ? "Ready for review" : "Blocked"}</span></header>
    <div className="risk-grid"><Metric label="Read only" value={result.analysis.risk.read_only} tone="green" /><Metric label="Approval required" value={result.analysis.risk.approval_required} tone="amber" /><Metric label="Prohibited" value={result.analysis.risk.prohibited} tone="red" /><Metric label="Resolved refs" value={result.analysis.references.resolvedLocal} tone="blue" /></div>
    <div className="preflight-details"><div><span>Server origin</span><strong>{result.baseUrl ?? "Not declared"}</strong><small className={result.analysis.originSafety.safe ? "good" : "warn"}>{result.analysis.originSafety.message}</small></div><div><span>Authentication schemes</span><strong>{result.analysis.securitySchemes.join(", ") || "None declared"}</strong></div><div><span>Contract fingerprint</span><code>{result.specHash.slice(0, 24)}…</code></div></div>
    {!!result.analysis.warnings.length && <div className="warning-list">{result.analysis.warnings.map((warning) => <p key={warning}><IconAlertTriangle size={15} />{warning}</p>)}</div>}
    {!!changes.length && <div className="change-list"><h3>Revision changes</h3>{changes.slice(0, 8).map((change) => <div key={`${change.operationId}-${change.reason}`}><span className={`change-level ${change.level}`}>{change.level}</span><strong>{change.operationId}</strong><small>{change.reason}</small></div>)}</div>}
  </section>;
}

function Metric({ label, value, tone }: { label: string; value: number; tone: string }) { return <div className={`risk-metric ${tone}`}><strong>{value}</strong><span>{label}</span></div>; }
