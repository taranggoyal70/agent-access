export const sampleOpenApi = {
  openapi: "3.1.0",
  info: { title: "Acme Projects API", version: "1.4.0" },
  servers: [{ url: "https://api.acme.example/v1" }],
  paths: {
    "/projects": {
      get: {
        operationId: "list_projects",
        summary: "List projects in the current workspace",
        responses: { "200": { description: "Projects", content: { "application/json": { schema: { type: "array", items: { type: "object" } } } } } },
      },
      post: {
        operationId: "create_project",
        summary: "Create a project in the current workspace",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["name", "key"], properties: { name: { type: "string" }, key: { type: "string" } } } } } },
        responses: { "201": { description: "Created project", content: { "application/json": { schema: { type: "object" } } } } },
      },
    },
    "/projects/{id}/members": {
      post: {
        operationId: "invite_member",
        summary: "Invite a member to a project",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["email", "role"], properties: { email: { type: "string", format: "email" }, role: { type: "string", enum: ["admin", "member", "viewer"] } } } } } },
        responses: { "201": { description: "Invitation created" } },
      },
    },
    "/projects/{id}": {
      delete: { operationId: "delete_project", summary: "Delete a project permanently", responses: { "204": { description: "Deleted" } } },
    },
  },
};
