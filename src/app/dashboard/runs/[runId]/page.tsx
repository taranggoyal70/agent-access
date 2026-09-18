import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentOrganization } from "@/lib/auth";
import { getRun } from "@/lib/agent/run-store";

const KIND_LABEL: Record<string, string> = {
  plan: "Planned",
  preflight: "Preflight",
  invocation: "Invoked",
  refusal: "Refused",
  halt: "Halted",
};

function detailText(kind: string, detail: Record<string, unknown>) {
  if (kind === "preflight") {
    return detail.ok === true
      ? `${detail.provider}/${detail.model} supports tool calling`
      : String(detail.detail ?? "preflight failed");
  }
  if (kind === "plan" && detail.phase === "toolset") {
    const admitted = Array.isArray(detail.admitted) ? detail.admitted.length : 0;
    const withheld = Array.isArray(detail.withheld) ? detail.withheld.length : 0;
    return `${admitted} capability${admitted === 1 ? "" : " capabilities"} admitted, ${withheld} withheld`;
  }
  if (typeof detail.text === "string" && detail.text) return detail.text;
  if (typeof detail.reason === "string") return detail.reason;
  if (typeof detail.error === "string") return detail.error;
  if (typeof detail.explanation === "string") return detail.explanation;
  return "";
}

export default async function AgentRunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const organization = await getCurrentOrganization();
  const found = await getRun(organization.id, runId);
  if (!found) notFound();
  const { run, steps } = found;

  const withheld = steps[0]?.detail?.withheld;
  const withheldList = Array.isArray(withheld) ? (withheld as { operation_id: string; reason: string }[]) : [];

  return <div className="console-page">
    <header className="page-header"><div>
      <p className="kicker">Agent run &middot; {run.sandbox_slug}</p>
      <h1>{run.goal}</h1>
      <p>{run.model} &middot; {run.allow_writes ? "writes allowed" : "read-only"} &middot; {run.invocation_count} capability {run.invocation_count === 1 ? "call" : "calls"} &middot; started {run.started_at}</p>
    </div></header>

    <div className="receipt-card">
      <div className="receipt-card-header">
        <strong>{run.halt_reason ? `${run.status} — ${run.halt_reason.replaceAll("_", " ")}` : run.status}</strong>
        <span>{run.finished_at ?? "in progress"}</span>
      </div>
      {run.final_text
        ? <p>{run.final_text}</p>
        : <p>The run produced no final answer. The step log below shows where it stopped.</p>}
    </div>

    {withheldList.length > 0 && <section className="shadow-guardrail">
      <h2>Withheld from this run</h2>
      <ul className="warning-list">{withheldList.map((item) => <li key={item.operation_id}><code>{item.operation_id}</code> — {item.reason}</li>)}</ul>
    </section>}

    <section className="verification-timeline">
      <h2>Step log</h2>
      {steps.map((step) => <article key={step.step_index} className="verification-step">
        <header>
          <strong>{KIND_LABEL[step.kind] ?? step.kind}</strong>
          {step.operation_id && <code>{step.operation_id}</code>}
          {step.policy && <span className="state">{step.policy.replaceAll("_", " ")}</span>}
          {step.status_code !== null && <span className="state">HTTP {step.status_code}</span>}
        </header>
        {detailText(step.kind, step.detail) && <p>{detailText(step.kind, step.detail)}</p>}
        {step.receipt_id && <p className="receipt-line">
          Receipt <Link href={`/api/receipts/${step.receipt_id}`}><code>{step.receipt_id}</code></Link>
        </p>}
      </article>)}
    </section>
  </div>;
}
