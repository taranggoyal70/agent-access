import { ImportForm } from "@/components/ImportForm";

export default function ImportPage() {
  return <div className="console-page narrow"><header className="page-header"><div><p className="kicker">New agent surface</p><h1>Import an OpenAPI contract</h1><p>Nothing is exposed until you review policies and publish.</p></div></header><ImportForm /></div>;
}
