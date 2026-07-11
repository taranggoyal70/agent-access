"use client";

import { useState } from "react";
import { IconCheck, IconChevronRight, IconCopy, IconFileCertificate, IconLoader2, IconRefresh, IconShieldCheck } from "@tabler/icons-react";

type Receipt = {
  receipt_id?: string;
  issued_at?: string;
  environment?: string;
  delegation_id?: string;
  idempotency_key?: string;
  status_code?: number;
  duration_ms?: number;
  signature?: string;
  request?: Record<string, unknown>;
  response?: unknown;
  principal?: { name?: string };
  agent?: { id?: string; name?: string };
  capability?: { operation_id?: string; method?: string; path?: string; policy?: string; scope?: string };
};

export function VerificationConsole({ sandboxId, sandbox, initialReceipt, origin }: { sandboxId: string; sandbox: { name: string; slug: string; version: string; status: string; capability_count: string; imported_at: string }; initialReceipt: Receipt | null; origin: string }) {
  const [receipt, setReceipt] = useState<Receipt | null>(initialReceipt);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"request" | "trace">("request");
  const discovery = `${origin}/.well-known/agent-access/${sandbox.slug}`;
  const mcp = `${origin}/mcp/${sandbox.slug}`;

  async function verify() {
    setRunning(true); setError(null);
    const response = await fetch(`/api/sandboxes/${sandboxId}/verify`, { method: "POST" });
    const result = await response.json(); setRunning(false);
    if (!response.ok) return setError(result.error ?? "Verification failed");
    setReceipt(result.receipt);
  }

  return <div className="verification-page">
    <header className="verification-header"><div><div className="heading-line"><h1>Verify your agent surface</h1><span className="verified-status"><i /> Sandbox published</span></div><p>End-to-end verification of discovery, agent registration, delegation, execution, and receipt integrity.</p></div><button className="button ghost" onClick={verify} disabled={running}>{running ? <IconLoader2 className="spin" size={17} /> : <IconRefresh size={17} />}{receipt ? "Run again" : "Run verification"}</button></header>
    {error && <p className="banner-error">{error}</p>}
    <div className="verification-grid"><section className="verification-main">
      <div className="verification-timeline">{[
        ["Discovery manifest read", "Agent resolved capabilities and machine endpoints."],
        ["Agent account registered", "A first-class sandbox identity was created."],
        ["Delegation approved", "A one-hour scoped delegation issued a short-lived credential."],
        [receipt ? `Capability invoked: ${receipt.capability?.operation_id}` : "Capability invocation pending", receipt ? "The agent completed work and returned a signed execution receipt." : "Run verification to execute an allowed capability."],
      ].map(([title, description], index) => <div className={receipt || index < 3 ? "verification-step complete" : "verification-step"} key={title}><span>{index + 1}</span>{(receipt || index < 3) && <IconCheck size={14} />}<div><strong>{title}</strong><small>{description}</small></div>{index < 3 && <button>View <IconChevronRight size={14} /></button>}</div>)}</div>
      {receipt ? <div className="verification-results"><article className="machine-panel"><div className="machine-tabs"><button className={tab === "request" ? "active" : ""} onClick={() => setTab("request")}>Request / Response</button><button className={tab === "trace" ? "active" : ""} onClick={() => setTab("trace")}>Trace</button></div>{tab === "request" ? <><label>Request</label><pre>{JSON.stringify(receipt.request, null, 2)}</pre><label>Response ({receipt.status_code})</label><pre className="response-code">{JSON.stringify(receipt.response, null, 2)}</pre></> : <div className="trace-summary"><IconShieldCheck size={27} /><strong>4 verified stages</strong><p>{receipt.duration_ms} ms · no retries · policy enforced</p></div>}</article><article className="receipt-card"><div className="receipt-card-header"><strong>Execution receipt</strong><span><IconShieldCheck size={15} /> Verified</span></div>{[
        ["Receipt ID", receipt.receipt_id], ["Issued at", receipt.issued_at], ["Environment", receipt.environment], ["Principal", receipt.principal?.name], ["Agent account", receipt.agent?.id], ["Agent name", receipt.agent?.name], ["Capability", receipt.capability?.operation_id], ["HTTP method", receipt.capability?.method], ["Endpoint", receipt.capability?.path], ["Policy", receipt.capability?.policy], ["Scope", receipt.capability?.scope], ["Delegation ID", receipt.delegation_id], ["Idempotency key", receipt.idempotency_key], ["Status", receipt.status_code], ["Signature", `${String(receipt.signature).slice(0, 20)}…`],
      ].map(([label, value]) => <div className="receipt-line" key={label}><span>{label}</span><strong>{String(value ?? "—")}</strong></div>)}<footer><IconShieldCheck size={16} /> Tamper-evident and bound to the request and delegation.</footer></article></div> : <div className="verification-empty"><IconFileCertificate size={28} /><h2>No execution receipt yet</h2><p>Run the live verification to register an agent, issue a scoped credential, invoke a capability, and sign the result.</p><button className="button primary" onClick={verify} disabled={running}>Run verification</button></div>}
    </section><aside className="sandbox-inspector"><section><h2>Sandbox access</h2><CopyField label="Discovery manifest" value={discovery} /><CopyField label="MCP endpoint" value={mcp} /><CopyField label="REST base URL" value={`${origin}/api/agent/v1/${sandbox.slug}`} /></section><section><h2>Sandbox</h2><Meta label="Name" value={sandbox.name} /><Meta label="Version" value={sandbox.version} /><Meta label="Visibility" value={sandbox.status} /><Meta label="Capabilities" value={sandbox.capability_count} /><Meta label="Imported" value={new Date(sandbox.imported_at).toLocaleString()} /></section></aside></div>
  </div>;
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return <label className="endpoint-field"><span>{label}</span><div><code>{value}</code><button aria-label={`Copy ${label}`} onClick={async () => { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200); }}>{copied ? <IconCheck size={15} /> : <IconCopy size={15} />}</button></div></label>;
}
function Meta({ label, value }: { label: string; value: string }) { return <div className="meta-line"><span>{label}</span><strong>{value}</strong></div>; }
