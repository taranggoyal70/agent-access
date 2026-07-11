import { ImportForm } from "@/components/ImportForm";

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project } = await searchParams;
  return <div className="console-page import-page"><header className="page-header"><div><p className="kicker">{project ? "New import revision" : "New agent surface"}</p><h1>{project ? "Check a new API revision" : "Connect an API for agents"}</h1><p>Preflight first. Nothing is published and no authority expands until you review it.</p></div></header><ImportForm projectId={project} /></div>;
}
