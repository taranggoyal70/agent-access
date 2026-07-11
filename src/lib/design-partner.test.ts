import { beforeAll, describe, expect, it } from "vitest";
import { encryptSecret, decryptSecret } from "./encryption";
import { preflightOpenApi } from "./import-preflight";
import { assertSafeHttpsUrl } from "./safe-url";
import { sampleOpenApi } from "./sample";

beforeAll(() => { process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64"); });

describe("design-partner import security", () => {
  it("encrypts Vendor Connection secrets with unique authenticated ciphertext", () => {
    const first = encryptSecret("staging-secret");
    const second = encryptSecret("staging-secret");
    expect(first.ciphertext).not.toBe("staging-secret");
    expect(first.iv).not.toBe(second.iv);
    expect(decryptSecret(first)).toBe("staging-secret");
  });

  it("blocks private and local staging destinations", async () => {
    await expect(assertSafeHttpsUrl("https://127.0.0.1/openapi.json")).rejects.toThrow(/Private|reserved/);
    await expect(assertSafeHttpsUrl("http://example.com/openapi.json")).rejects.toThrow(/HTTPS/);
    await expect(assertSafeHttpsUrl("https://localhost/openapi.json")).rejects.toThrow(/Local/);
  });

  it("classifies risk and revision changes before persistence", () => {
    const result = preflightOpenApi(JSON.stringify(sampleOpenApi), [{ operation_id: "old_operation", method: "GET", path: "/old", policy: "read_only" }]);
    expect(result.analysis.risk.read_only).toBe(1);
    expect(result.analysis.risk.approval_required).toBe(2);
    expect(result.analysis.risk.prohibited).toBe(1);
    expect(result.analysis.changes.removed[0].operationId).toBe("old_operation");
    expect(result.analysis.changes.added.length).toBe(4);
  });
});
