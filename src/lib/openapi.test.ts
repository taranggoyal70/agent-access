import { describe, expect, it } from "vitest";
import { parseOpenApi } from "./openapi";

describe("parseOpenApi", () => {
  it("creates safe default policies", () => {
    const parsed = parseOpenApi(JSON.stringify({
      openapi: "3.1.0",
      info: { title: "Projects", version: "1.0.0" },
      paths: {
        "/projects": {
          get: { operationId: "list_projects", responses: { 200: { description: "ok" } } },
          post: { operationId: "create_project", responses: { 201: { description: "created" } } },
        },
        "/projects/{id}": { delete: { operationId: "delete_project", responses: { 204: { description: "deleted" } } } },
      },
    }));
    expect(parsed.capabilities.map(({ operationId, policy }) => [operationId, policy])).toEqual([
      ["list_projects", "read_only"],
      ["create_project", "approval_required"],
      ["delete_project", "prohibited"],
    ]);
  });

  it("rejects documents without operations", () => {
    expect(() => parseOpenApi('openapi: 3.1.0\ninfo:\n  title: Empty\n  version: 1\npaths: {}')).toThrow();
  });
});
