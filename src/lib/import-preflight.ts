import { createHash } from "node:crypto";
import { parseOpenApi, type CapabilityDraft } from "./openapi";
import { fetchBoundedJsonText } from "./safe-url";
import { sampleOpenApi } from "./sample";

type ExistingCapability = { operation_id: string; method: string; path: string; policy: string };

export type ImportInput = { sourceType: "url" | "file" | "paste" | "sample"; source?: string; sourceUrl?: string; sourceToken?: string };

export async function loadImportSource(input: ImportInput) {
  if (input.sourceType === "sample") return JSON.stringify(sampleOpenApi);
  if (input.sourceType === "url") {
    if (!input.sourceUrl) throw new Error("OpenAPI URL is required");
    return fetchBoundedJsonText(new URL(input.sourceUrl), input.sourceToken);
  }
  const source = input.source?.trim() ?? "";
  if (!source) throw new Error("OpenAPI document is required");
  return source;
}

function walk(value: unknown, visit: (record: Record<string, unknown>) => void) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) return value.forEach((item) => walk(item, visit));
  const record = value as Record<string, unknown>;
  visit(record);
  Object.values(record).forEach((item) => walk(item, visit));
}

function pointerExists(document: Record<string, unknown>, pointer: string) {
  if (!pointer.startsWith("#/")) return false;
  let current: unknown = document;
  for (const part of pointer.slice(2).split("/").map((item) => item.replaceAll("~1", "/").replaceAll("~0", "~"))) {
    if (!current || typeof current !== "object" || !(part in current)) return false;
    current = (current as Record<string, unknown>)[part];
  }
  return true;
}

export function preflightOpenApi(source: string, existing: ExistingCapability[] = []) {
  const parsed = parseOpenApi(source);
  const document = parsed.document as Record<string, unknown>;
  const refs: string[] = [];
  walk(document, (record) => { if (typeof record.$ref === "string") refs.push(record.$ref); });
  const localRefs = refs.filter((ref) => ref.startsWith("#/"));
  const externalRefs = refs.filter((ref) => !ref.startsWith("#/"));
  const unresolvedLocalRefs = localRefs.filter((ref) => !pointerExists(document, ref));
  const securitySchemes = Object.keys((((document.components as Record<string, unknown> | undefined)?.securitySchemes ?? {}) as Record<string, unknown>));
  const risk = parsed.capabilities.reduce((counts, capability) => { counts[capability.policy] += 1; return counts; }, { read_only: 0, reversible: 0, approval_required: 0, prohibited: 0 });
  const previous = new Map(existing.map((item) => [item.operation_id, item]));
  const current = new Map(parsed.capabilities.map((item) => [item.operationId, item]));
  const added = parsed.capabilities.filter((item) => !previous.has(item.operationId)).map(changeFor);
  const removed = existing.filter((item) => !current.has(item.operation_id)).map((item) => ({ operationId: item.operation_id, level: "breaking", reason: "Capability removed" }));
  const changed = parsed.capabilities.flatMap((item) => {
    const before = previous.get(item.operationId);
    if (!before || (before.method === item.method && before.path === item.path)) return [];
    return [{ operationId: item.operationId, level: "breaking", reason: `${before.method} ${before.path} changed to ${item.method} ${item.path}` }];
  });
  const warnings = [
    ...externalRefs.length ? [`${externalRefs.length} external $ref reference(s) require bundling before promotion`] : [],
    ...unresolvedLocalRefs.length ? [`${unresolvedLocalRefs.length} local $ref reference(s) could not be resolved`] : [],
    ...parsed.baseUrl ? [] : ["No server URL is declared; enter the staging origin manually"],
    ...securitySchemes.length ? [] : ["No OpenAPI security scheme is declared"],
  ];
  return {
    ...parsed,
    specHash: createHash("sha256").update(JSON.stringify(document)).digest("hex"),
    analysis: {
      operationCount: parsed.capabilities.length,
      risk,
      references: { total: refs.length, resolvedLocal: localRefs.length - unresolvedLocalRefs.length, unresolvedLocal: unresolvedLocalRefs.length, external: externalRefs.length },
      securitySchemes,
      warnings,
      changes: { added, removed, changed, total: added.length + removed.length + changed.length },
      ready: externalRefs.length === 0 && unresolvedLocalRefs.length === 0,
    },
  };
}

function changeFor(capability: CapabilityDraft) {
  return { operationId: capability.operationId, level: capability.policy === "read_only" ? "review" : "dangerous", reason: capability.policy === "read_only" ? "New read-only capability" : "New mutating capability" };
}
