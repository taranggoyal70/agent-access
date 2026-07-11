import { createHmac, timingSafeEqual } from "node:crypto";

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}`;
}

function signingSecret() {
  const secret = process.env.RECEIPT_SIGNING_SECRET;
  if (!secret) throw new Error("RECEIPT_SIGNING_SECRET is not configured");
  return secret;
}

export function signReceipt(payload: unknown) {
  const serialized = stable(payload);
  const signature = createHmac("sha256", signingSecret()).update(serialized).digest("base64url");
  const signatureHash = createHmac("sha256", signingSecret()).update(signature).digest("hex");
  return { signature, signatureHash };
}

export function verifyReceipt(payload: unknown, signature: string) {
  const expected = signReceipt(payload).signature;
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
