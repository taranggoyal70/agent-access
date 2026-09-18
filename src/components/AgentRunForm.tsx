"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { IconLoader2, IconPlayerPlay } from "@tabler/icons-react";

export function AgentRunForm({ sandboxes }: { sandboxes: { slug: string; name: string }[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/agent-runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sandbox_slug: form.get("sandbox_slug"),
        goal: form.get("goal"),
        allow_writes: form.get("allow_writes") === "on",
      }),
    });
    const result = await response.json();
    setLoading(false);
    if (!response.ok) return setError(result.error ?? "Agent run failed");
    router.push(`/dashboard/runs/${result.run_id}`);
  }

  if (!sandboxes.length) {
    return <div className="table-empty">Publish a sandbox before running an agent against it.</div>;
  }

  return <form className="partner-form" onSubmit={submit}>
    <div className="form-grid">
      <label>Sandbox<select name="sandbox_slug" id="agent-run-sandbox" required defaultValue={sandboxes[0].slug}>{sandboxes.map((sandbox) => <option key={sandbox.slug} value={sandbox.slug}>{sandbox.name}</option>)}</select></label>
      <label>Allow reversible writes <span>Off by default</span><input type="checkbox" name="allow_writes" id="agent-run-allow-writes" /></label>
    </div>
    <label>Goal<textarea name="goal" id="agent-run-goal" required minLength={8} maxLength={2000} placeholder="Example: List every project in the workspace and tell me which ones have no members." /></label>
    {error && <p className="form-error">{error}</p>}
    <button className="button primary" type="submit" disabled={loading}>{loading ? <IconLoader2 className="spin" size={17} /> : <IconPlayerPlay size={17} />}{loading ? "Running" : "Run agent"}</button>
    <small>The agent reaches this deployment through the public agent surface under a one-hour delegated credential. Capabilities requiring approval stop the run.</small>
  </form>;
}
