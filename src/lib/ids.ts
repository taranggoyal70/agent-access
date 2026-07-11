import { createHash, randomBytes, randomUUID } from "node:crypto";

export function createOpaqueId(prefix: string) {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

export function createSecret(prefix: string) {
  return `${prefix}_${randomBytes(32).toString("base64url")}`;
}

export function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "project";
}
