import { describe, expect, it } from "vitest";

import { admit, buildToolset, toolNameFor, type PublishedCapability } from "./tools";

function capability(overrides: Partial<PublishedCapability> = {}): PublishedCapability {
  return {
    operation_id: "list_projects",
    summary: "List projects",
    method: "GET",
    path: "/projects",
    input_schema: {},
    policy: "read_only",
    scope: "projects:read",
    ...overrides,
  };
}

describe("admit", () => {
  it("admits read-only capabilities", () => {
    expect(admit(capability(), false)).toBe("invocable");
  });

  it("withholds reversible capabilities unless the run allows writes", () => {
    const reversible = capability({ policy: "reversible" });
    expect(admit(reversible, false)).toBe("withheld");
    expect(admit(reversible, true)).toBe("invocable");
  });

  it("gates approval-required capabilities even when writes are allowed", () => {
    expect(admit(capability({ policy: "approval_required" }), true)).toBe("gated");
  });

  it("never admits prohibited capabilities", () => {
    expect(admit(capability({ policy: "prohibited" }), true)).toBe("withheld");
  });

  it("withholds an unrecognised policy rather than defaulting open", () => {
    const unknown = capability({ policy: "escalated" as PublishedCapability["policy"] });
    expect(admit(unknown, true)).toBe("withheld");
  });
});

describe("toolNameFor", () => {
  it("passes through a name that is already valid", () => {
    expect(toolNameFor("list_projects")).toBe("list_projects");
  });

  it("replaces characters the Messages API does not accept", () => {
    expect(toolNameFor("projects.list/v1")).toBe("projects_list_v1");
  });

  it("resolves collisions instead of overwriting a taken name", () => {
    const taken = new Set(["list_projects"]);
    expect(toolNameFor("list_projects", taken)).toBe("list_projects_2");
  });

  it("falls back for an operation id with no usable characters", () => {
    expect(toolNameFor("!!!")).toBe("capability");
  });
});

describe("buildToolset", () => {
  it("normalises an empty request body to an object schema", () => {
    const { tools } = buildToolset([capability()], { allowWrites: false });
    expect(tools[0].inputSchema).toEqual({ type: "object", properties: {}, additionalProperties: false });
  });

  it("preserves a real request body schema", () => {
    const schema = { type: "object", properties: { name: { type: "string" } }, required: ["name"] };
    const { tools } = buildToolset(
      [capability({ policy: "reversible", input_schema: schema })],
      { allowWrites: true },
    );
    expect(tools[0].inputSchema).toEqual(schema);
  });

  it("reports why each capability was withheld", () => {
    const { tools, withheld } = buildToolset(
      [
        capability(),
        capability({ operation_id: "delete_project", policy: "prohibited" }),
        capability({ operation_id: "create_project", policy: "reversible" }),
      ],
      { allowWrites: false },
    );
    expect(tools).toHaveLength(1);
    expect(withheld).toEqual([
      { operation_id: "delete_project", policy: "prohibited", reason: "capability is prohibited by policy" },
      { operation_id: "create_project", policy: "reversible", reason: "run does not allow writes" },
    ]);
  });

  it("declares gated capabilities and tells the model a person decides", () => {
    const { tools, byToolName } = buildToolset(
      [capability({ operation_id: "invite_member", policy: "approval_required" })],
      { allowWrites: true },
    );
    expect(byToolName.get("invite_member")?.admission).toBe("gated");
    expect(tools[0].description).toContain("requires human approval");
  });

  it("maps every tool name back to exactly one capability", () => {
    const { tools, byToolName } = buildToolset(
      [capability({ operation_id: "projects.list" }), capability({ operation_id: "projects/list" })],
      { allowWrites: false },
    );
    expect(tools.map((tool) => tool.name)).toEqual(["projects_list", "projects_list_2"]);
    expect(byToolName.get("projects_list")?.capability.operation_id).toBe("projects.list");
    expect(byToolName.get("projects_list_2")?.capability.operation_id).toBe("projects/list");
  });
});
