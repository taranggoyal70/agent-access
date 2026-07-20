import { describe, expect, it } from "vitest";

import { assertSafeHttpsUrl } from "./safe-url";

// IP-literal hosts skip DNS, so these assertions are deterministic and offline.
describe("assertSafeHttpsUrl", () => {
  it("rejects non-HTTPS", async () => {
    await expect(assertSafeHttpsUrl("http://example.com")).rejects.toThrow();
  });

  it("rejects embedded credentials", async () => {
    await expect(assertSafeHttpsUrl("https://user:pass@example.com")).rejects.toThrow();
  });

  it("rejects localhost and .local", async () => {
    await expect(assertSafeHttpsUrl("https://localhost")).rejects.toThrow();
    await expect(assertSafeHttpsUrl("https://printer.local")).rejects.toThrow();
  });

  it.each([
    "https://127.0.0.1",
    "https://10.0.0.5",
    "https://169.254.169.254", // cloud metadata
    "https://172.16.0.1",
    "https://192.168.1.1",
    "https://100.64.0.1", // carrier-grade NAT
  ])("rejects private/reserved IPv4 %s", async (url) => {
    await expect(assertSafeHttpsUrl(url)).rejects.toThrow();
  });

  it.each(["https://[::1]", "https://[::ffff:127.0.0.1]", "https://[fd00::1]"])(
    "rejects private/mapped IPv6 %s",
    async (url) => {
      await expect(assertSafeHttpsUrl(url)).rejects.toThrow();
    },
  );

  it("allows a public IP literal", async () => {
    const url = await assertSafeHttpsUrl("https://8.8.8.8/openapi.json");
    expect(url.hostname).toBe("8.8.8.8");
  });
});
