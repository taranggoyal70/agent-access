import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key() {
  const value = process.env.DATA_ENCRYPTION_KEY;
  if (!value) throw new Error("DATA_ENCRYPTION_KEY is not configured");
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== 32) throw new Error("DATA_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  return decoded;
}

export type EncryptedValue = { ciphertext: string; iv: string; tag: string };

export function encryptSecret(value: string): EncryptedValue {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}

export function decryptSecret(value: EncryptedValue) {
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(value.iv, "base64"));
  decipher.setAuthTag(Buffer.from(value.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(value.ciphertext, "base64")), decipher.final()]).toString("utf8");
}
