import Link from "next/link";
import { IconArrowRight, IconBraces, IconKey, IconReceipt, IconShieldCheck } from "@tabler/icons-react";

export default function HomePage() {
  return (
    <main className="landing">
      <nav className="landing-nav"><Link href="/" className="wordmark">Agent Access</Link><div><Link href="/docs">Docs</Link><Link href="/design-partner">Design partners</Link><Link className="button ghost" href="/sign-in">Sign in</Link><Link className="button primary" href="/sign-up">Start building</Link></div></nav>
      <section className="hero">
        <p className="eyebrow">Infrastructure for the agentic internet</p>
        <h1>Let AI agents become real customers of your software.</h1>
        <p className="hero-copy">Import your OpenAPI spec. Publish agent discovery, scoped access, sandbox accounts, and tamper-evident receipts—without rebuilding your identity stack.</p>
        <div className="hero-actions"><Link className="button primary large" href="/sign-up">Publish an agent sandbox <IconArrowRight size={18} /></Link><Link className="button ghost large" href="/docs">Read the machine docs</Link></div>
        <div className="machine-flow"><code>/.well-known/agent-access.json</code><IconArrowRight size={18} /><code>delegation</code><IconArrowRight size={18} /><code>short-lived credential</code><IconArrowRight size={18} /><code>signed receipt</code></div>
      </section>
      <section className="value-grid">
        <article><IconBraces /><h2>Machine-first discovery</h2><p>MCP, REST, schemas, limits, and errors generated from one reviewed contract.</p></article>
        <article><IconKey /><h2>Delegated authority</h2><p>Every agent credential is short-lived, tenant-scoped, and bound to a principal.</p></article>
        <article><IconShieldCheck /><h2>Policy before execution</h2><p>Read-only, reversible, approval-required, and prohibited actions are explicit.</p></article>
        <article><IconReceipt /><h2>Proof after execution</h2><p>Every invocation creates a verifiable receipt tied to the request and policy decision.</p></article>
      </section>
    </main>
  );
}
