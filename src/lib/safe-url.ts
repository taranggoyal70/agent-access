import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function blockedIpv4(address: string) {
  const parts = address.split(".").map(Number);
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}

function blockedIpv6(address: string) {
  const normalized = address.toLowerCase();
  return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb");
}

export async function assertSafeHttpsUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Enter a valid HTTPS URL"); }
  if (url.protocol !== "https:") throw new Error("Only HTTPS URLs are allowed");
  if (url.username || url.password) throw new Error("Credentials cannot be embedded in a URL");
  if (url.hostname === "localhost" || url.hostname.endsWith(".localhost") || url.hostname.endsWith(".local")) throw new Error("Local network hosts are not allowed");
  const literalVersion = isIP(url.hostname);
  const addresses = literalVersion ? [{ address: url.hostname, family: literalVersion }] : await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address, family }) => family === 4 ? blockedIpv4(address) : blockedIpv6(address))) throw new Error("Private or reserved network destinations are not allowed");
  return url;
}

export async function fetchBoundedJsonText(url: URL, authorization?: string) {
  await assertSafeHttpsUrl(url.toString());
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, { headers: authorization ? { Authorization: `Bearer ${authorization}` } : undefined, redirect: "manual", signal: controller.signal, cache: "no-store" });
    if (response.status >= 300 && response.status < 400) throw new Error("Redirects are not followed; import the final HTTPS URL directly");
    if (!response.ok) throw new Error(`The OpenAPI URL returned HTTP ${response.status}`);
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > 1_000_000) throw new Error("OpenAPI document must be smaller than 1 MB");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > 1_000_000) throw new Error("OpenAPI document must be smaller than 1 MB");
    return bytes.toString("utf8");
  } finally { clearTimeout(timeout); }
}
