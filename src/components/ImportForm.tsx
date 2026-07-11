"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconFileUpload, IconLoader2 } from "@tabler/icons-react";

export function ImportForm() {
  const router = useRouter();
  const [source, setSource] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(sample = false) {
    setLoading(true); setError(null);
    const response = await fetch("/api/projects/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sample ? { sample: true } : { source }) });
    const result = await response.json();
    setLoading(false);
    if (!response.ok) return setError(result.error ?? "Import failed");
    router.push(`/dashboard/projects/${result.projectId}`);
  }

  return <div className="import-layout">
    <section className="import-main"><div className="dropzone">
      <IconFileUpload size={28} />
      <h2>Paste or upload OpenAPI</h2>
      <p>JSON or YAML · OpenAPI 3.x · Maximum 1 MB</p>
      <input aria-label="Upload OpenAPI file" type="file" accept=".json,.yaml,.yml,application/json,text/yaml" onChange={async (event) => { const file = event.target.files?.[0]; if (file) setSource(await file.text()); }} />
    </div>
    <textarea aria-label="OpenAPI document" value={source} onChange={(event) => setSource(event.target.value)} placeholder={'openapi: 3.1.0\ninfo:\n  title: My API\n  version: 1.0.0\npaths: ...'} />
    {error && <p className="form-error">{error}</p>}
    <div className="form-actions"><button className="button ghost" type="button" disabled={loading} onClick={() => submit(true)}>Use realistic sample</button><button className="button primary" type="button" disabled={loading || !source.trim()} onClick={() => submit(false)}>{loading && <IconLoader2 className="spin" size={17} />}Analyze capabilities</button></div>
    </section>
    <aside className="import-aside"><h2>What happens next</h2><ol><li><span>1</span>Operations become capability proposals.</li><li><span>2</span>You classify side effects and approval policy.</li><li><span>3</span>We publish discovery, MCP, REST, and sandbox access.</li><li><span>4</span>A real test agent returns a signed receipt.</li></ol></aside>
  </div>;
}
