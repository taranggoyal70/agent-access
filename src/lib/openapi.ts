import YAML from "yaml";
import { z } from "zod";
import { slugify } from "./ids";

const documentSchema = z.object({
  openapi: z.string().startsWith("3."),
  info: z.object({ title: z.string().min(1), version: z.string().min(1) }),
  servers: z.array(z.object({ url: z.string().url() })).optional(),
  paths: z.record(z.string(), z.record(z.string(), z.unknown())),
}).passthrough();

export type CapabilityDraft = {
  operationId: string;
  method: string;
  path: string;
  summary: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  policy: "read_only" | "reversible" | "approval_required" | "prohibited";
  scope: string;
};

function defaultPolicy(method: string): CapabilityDraft["policy"] {
  if (method === "get" || method === "head") return "read_only";
  if (method === "delete") return "prohibited";
  return "approval_required";
}

export function parseOpenApi(source: string) {
  if (Buffer.byteLength(source, "utf8") > 1_000_000) throw new Error("OpenAPI document must be smaller than 1 MB");
  let parsed: unknown;
  try { parsed = JSON.parse(source); } catch { parsed = YAML.parse(source); }
  const document = documentSchema.parse(parsed);
  const capabilities: CapabilityDraft[] = [];
  const methods = new Set(["get", "post", "put", "patch", "delete", "head"]);

  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const [method, rawOperation] of Object.entries(pathItem)) {
      if (!methods.has(method.toLowerCase()) || !rawOperation || typeof rawOperation !== "object") continue;
      const operation = rawOperation as Record<string, unknown>;
      const operationId = typeof operation.operationId === "string" ? operation.operationId : `${method}_${slugify(path)}`;
      const requestBody = operation.requestBody as Record<string, unknown> | undefined;
      const content = requestBody?.content as Record<string, { schema?: Record<string, unknown> }> | undefined;
      const responses = operation.responses as Record<string, { content?: Record<string, { schema?: Record<string, unknown> }> }> | undefined;
      const success = responses?.["200"] ?? responses?.["201"];
      const responseContent = success?.content;
      capabilities.push({
        operationId,
        method: method.toUpperCase(),
        path,
        summary: typeof operation.summary === "string" ? operation.summary : operationId.replaceAll("_", " "),
        inputSchema: content?.["application/json"]?.schema ?? {},
        outputSchema: responseContent?.["application/json"]?.schema ?? {},
        policy: defaultPolicy(method.toLowerCase()),
        scope: `${slugify(path.split("/").filter(Boolean)[0] ?? "resource")}:${method === "get" ? "read" : "write"}`,
      });
    }
  }

  if (!capabilities.length) throw new Error("No supported operations were found in this OpenAPI document");
  return {
    document,
    title: document.info.title,
    version: document.info.version,
    baseUrl: document.servers?.[0]?.url ?? null,
    capabilities,
  };
}
