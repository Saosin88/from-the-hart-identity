import { describe, it, expect, beforeAll } from "vitest";
import { buildApp } from "../src/app";
import { createMockFirestore } from "./mockFirestore";

describe("Auth Service Caller Verification", () => {
  let app: ReturnType<typeof buildApp>;
  let mock: ReturnType<typeof createMockFirestore>;

  beforeAll(() => {
    mock = createMockFirestore();
    app = buildApp(mock.firestore as any);
  });

  it("should return 403 when no auth headers are present on POST /identity", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/identity",
      body: {
        email: "test@example.com",
        first_name: "",
        last_name: "",
        identity_type: "person",
      },
    });

    expect(res.statusCode).toBe(403);
  });

  it("should return 403 when the caller is not the Auth service", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/identity",
      headers: {
        "x-goog-authenticated-user-email":
          "accounts.google.com:wrong-sa@project.iam.gserviceaccount.com",
      },
      body: {
        email: "test@example.com",
        first_name: "",
        last_name: "",
        identity_type: "person",
      },
    });

    expect(res.statusCode).toBe(403);
  });

  it("should return 201 when the caller is the Auth service", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/identity",
      headers: {
        "x-goog-authenticated-user-email":
          "accounts.google.com:auth-sa@test-project.iam.gserviceaccount.com",
      },
      body: {
        email: "sheldon@example.com",
        first_name: "",
        last_name: "",
        identity_type: "person",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveProperty("identity_id");
  });
});
