"use client";

import { useState } from "react";
import { IconExternalLink, IconLoader2 } from "@tabler/icons-react";

const statuses = ["applied","qualified","onboarding","active","committed","declined"] as const;
type Application = { id: string; company_name: string; contact_name: string; work_email: string; role_title: string; company_url: string; api_spec_url: string | null; agent_demand: string; target_workflow: string; timeline: string; status: typeof statuses[number]; created_at: string };
export function PartnerPipeline({ initial }: { initial: Application[] }) {
  const [applications,setApplications]=useState(initial); const [saving,setSaving]=useState<string | null>(null);
  async function update(id:string,status:Application["status"]){setSaving(id);const response=await fetch(`/api/admin/design-partners/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status})});setSaving(null);if(response.ok)setApplications(current=>current.map(item=>item.id===id?{...item,status}:item));}
  return <div className="pipeline-list">{applications.length ? applications.map(item=><article key={item.id}><header><div><h2>{item.company_name}</h2><p>{item.contact_name} · {item.role_title} · <a href={`mailto:${item.work_email}`}>{item.work_email}</a></p></div><a href={item.company_url} target="_blank" rel="noreferrer"><IconExternalLink size={15}/></a></header><p className="workflow">{item.target_workflow}</p><div className="pipeline-meta"><span>Demand: {item.agent_demand.replaceAll("_"," ")}</span><span>Timeline: {item.timeline.replaceAll("_"," ")}</span><span>Applied: {new Date(item.created_at).toLocaleDateString()}</span>{item.api_spec_url&&<a href={item.api_spec_url} target="_blank" rel="noreferrer">OpenAPI URL</a>}</div><footer><select value={item.status} onChange={event=>update(item.id,event.target.value as Application["status"])} disabled={saving===item.id}>{statuses.map(status=><option key={status} value={status}>{status}</option>)}</select>{saving===item.id&&<IconLoader2 className="spin" size={15}/>}</footer></article>):<div className="table-empty">No design-partner applications yet.</div>}</div>;
}
