import { describe, expect, it } from "vitest";

import { AgentSurfaceClient, SurfaceError, idempotencyKeyFor } from "./surface-client";

function stubFetch(handler: (url: string, init?: RequestInit) => { status: number; body: unknown }) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const { status, body } = handler(url, init);
    return new Response(body === undefined ? "" : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { impl, calls };
}

describe("AgentSurfaceClient", () => {
  it("reads capabilities from the published surface", async () => {
    const { impl, calls } = stubFetch(() => ({
      status: 200,
      body: { capabilities: [{ operation_id: "list_projects", policy: "read_only" }] },
    }));
    const capabilities = await new AgentSurfaceClient("https://example.test", "acme", impl).listCapabilities();
    expect(calls[0].url).toBe("https://example.test/api/agent/v1/acme/capabilities");
    expect(capabilities).toHaveLength(1);
  });

  it("raises the surface's own error text when a sandbox is unpublished", async () => {
    const { impl } = stubFetch(() => ({ status: 404, body: { error: "Agent surface not found" } }));
    const client = new AgentSurfaceClient("https://example.test", "missing", impl);
    await expect(client.listCapabilities()).rejects.toThrow("Agent surface not found");
  });

  it("sends the delegated credential and idempotency key on invoke", async () => {
    const { impl, calls } = stubFetch(() => ({
      status: 200,
      body: { receipt_id: "rcp_1", status_code: 200, signature: "sig", result: [] },
    }));
    const client = new AgentSurfaceClient("https://example.test", "acme", impl);
    const receipt = await client.invoke({
      operationId: "list_projects",
      credential: "aa_sbx_secret",
      body: {},
      idempotencyKey: "run_1:toolu_1",
    });

    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer aa_sbx_secret");
    expect(headers["idempotency-key"]).toBe("run_1:toolu_1");
    expect(receipt.receipt_id).toBe("rcp_1");
  });

  it("percent-encodes an operation id so it cannot escape its path segment", async () => {
    const { impl, calls } = stubFetch(() => ({ status: 200, body: { receipt_id: "rcp_1", status_code: 200, signature: "s" } }));
    await new AgentSurfaceClient("https://example.test", "acme", impl).invoke({
      operationId: "../../admin/design-partners",
      credential: "c",
      body: {},
      idempotencyKey: "k",
    });
    expect(calls[0].url).toBe("https://example.test/api/agent/v1/acme/invoke/..%2F..%2Fadmin%2Fdesign-partners");
  });

  it("throws when a policy denial carries no receipt", async () => {
    const { impl } = stubFetch(() => ({ status: 403, body: { error: "Capability is prohibited by policy" } }));
    const client = new AgentSurfaceClient("https://example.test", "acme", impl);
    await expect(
      client.invoke({ operationId: "delete_project", credential: "c", body: {}, idempotencyKey: "k" }),
    ).rejects.toBeInstanceOf(SurfaceError);
  });

  it("keeps a receipted non-2xx response, because the receipt is the evidence", async () => {
    const { impl } = stubFetch(() => ({
      status: 502,
      body: { receipt_id: "rcp_2", status_code: 502, signature: "sig" },
    }));
    const client = new AgentSurfaceClient("https://example.test", "acme", impl);
    const receipt = await client.invoke({ operationId: "list_projects", credential: "c", body: {}, idempotencyKey: "k" });
    expect(receipt.receipt_id).toBe("rcp_2");
    expect(receipt.status_code).toBe(502);
  });

  it("reports a non-JSON body as a surface error rather than crashing", async () => {
    const impl = (async () => new Response("<html>gateway</html>", { status: 502 })) as typeof fetch;
    const client = new AgentSurfaceClient("https://example.test", "acme", impl);
    await expect(client.listCapabilities()).rejects.toThrow("non-JSON body");
  });
});

describe("idempotencyKeyFor", () => {
  it("is stable for the same run and tool call", () => {
    expect(idempotencyKeyFor("run_1", "toolu_abc")).toBe("run_1:toolu_abc");
    expect(idempotencyKeyFor("run_1", "toolu_abc")).toBe(idempotencyKeyFor("run_1", "toolu_abc"));
  });

  it("differs across runs so one run cannot replay another's receipt", () => {
    expect(idempotencyKeyFor("run_1", "toolu_abc")).not.toBe(idempotencyKeyFor("run_2", "toolu_abc"));
  });

  it("stays within the header limit the invoke route enforces", () => {
    expect(idempotencyKeyFor("r".repeat(200), "t".repeat(200)).length).toBe(128);
  });
});
