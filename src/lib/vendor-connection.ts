import { createHash } from "node:crypto";
import { decryptSecret } from "./encryption";
import { assertSafeHttpsUrl } from "./safe-url";

export type VendorConnection = {
  id: string;
  origin: string;
  auth_type: "none" | "bearer" | "api_key";
  header_name: string | null;
  secret_ciphertext: string | null;
  secret_iv: string | null;
  secret_tag: string | null;
  status: "untested" | "active" | "failed" | "revoked";
};

function headersFor(connection: VendorConnection) {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (connection.auth_type === "none") return headers;
  if (!connection.secret_ciphertext || !connection.secret_iv || !connection.secret_tag) throw new Error("The Vendor Connection credential is unavailable");
  const secret = decryptSecret({ ciphertext: connection.secret_ciphertext, iv: connection.secret_iv, tag: connection.secret_tag });
  if (connection.auth_type === "bearer") headers.Authorization = `Bearer ${secret}`;
  else headers[connection.header_name ?? "X-API-Key"] = secret;
  return headers;
}

export async function testVendorConnection(connection: VendorConnection) {
  const url = await assertSafeHttpsUrl(connection.origin);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, { method: "GET", headers: headersFor(connection), redirect: "manual", signal: controller.signal, cache: "no-store" });
    if (response.status >= 300 && response.status < 400) throw new Error("The staging origin redirected; configure the final HTTPS origin directly");
    if (response.status >= 500) throw new Error(`The staging origin returned HTTP ${response.status}`);
    return { status: response.status, reachable: true };
  } finally { clearTimeout(timeout); }
}

export async function invokeVendorConnection(connection: VendorConnection, capabilityPath: string, input: Record<string, unknown>) {
  if (connection.status !== "active") throw new Error("Test and activate the Vendor Connection before invoking upstream capabilities");
  const pathParams = objectValues(input.path_params);
  const queryParams = objectValues(input.query);
  const renderedPath = capabilityPath.replace(/\{([^}]+)\}/g, (_, key: string) => {
    const value = pathParams[key];
    if (value === undefined) throw new Error(`Missing path parameter: ${key}`);
    return encodeURIComponent(String(value));
  });
  const base = await assertSafeHttpsUrl(connection.origin);
  const basePath = base.pathname.replace(/\/$/, "");
  base.pathname = `${basePath}/${renderedPath.replace(/^\//, "")}`;
  base.search = "";
  for (const [key, value] of Object.entries(queryParams)) {
    if (Array.isArray(value)) value.forEach((item) => base.searchParams.append(key, String(item)));
    else if (value !== undefined && value !== null) base.searchParams.set(key, String(value));
  }
  await assertSafeHttpsUrl(base.toString());
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  const started = Date.now();
  try {
    const response = await fetch(base, { method: "GET", headers: headersFor(connection), redirect: "manual", signal: controller.signal, cache: "no-store" });
    if (response.status >= 300 && response.status < 400) throw new Error("Upstream redirects are blocked");
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > 1_000_000) throw new Error("Upstream response exceeded the 1 MB safety limit");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > 1_000_000) throw new Error("Upstream response exceeded the 1 MB safety limit");
    const text = bytes.toString("utf8");
    let body: unknown = text;
    if (response.headers.get("content-type")?.includes("json")) {
      try { body = text ? JSON.parse(text) : null; } catch { throw new Error("Upstream declared JSON but returned an invalid body"); }
    }
    return {
      body,
      statusCode: response.status,
      durationMs: Math.max(1, Date.now() - started),
      responseBytes: bytes.byteLength,
      requestHash: hashEvidence({ path: renderedPath, path_params: pathParams, query: queryParams }),
      responseHash: createHash("sha256").update(bytes).digest("hex"),
      normalizedPath: renderedPath,
      origin: base.origin,
    };
  } finally { clearTimeout(timeout); }
}

function objectValues(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function hashEvidence(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
