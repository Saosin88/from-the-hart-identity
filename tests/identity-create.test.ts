import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { buildApp } from "../src/app";
import { createMockFirestore } from "./mockFirestore";
import jwt from "jsonwebtoken";

const MOCK_AUTH_EMAIL = "auth-sa@test-project.iam.gserviceaccount.com";
const authToken = () =>
  `Bearer ${jwt.sign({ email: MOCK_AUTH_EMAIL }, "test-secret")}`;

describe("POST /identity", () => {
  let app: ReturnType<typeof buildApp>;
  let mock: ReturnType<typeof createMockFirestore>;

  beforeAll(() => {
    mock = createMockFirestore();
    app = buildApp(mock.firestore as any);
  });

  beforeEach(() => {
    mock.store.clear();
  });

  it("should create an identity and return 201 with identity_id (Test 2)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/identity",
      headers: {
        authorization: authToken(),
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
    expect(body).toEqual({
      data: {
        identity_id: expect.any(String),
      },
    });
  });

  it("should return 403 when no auth headers are present (Test 3)", async () => {
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
    const body = JSON.parse(res.body);
    expect(body).toEqual({ error: { message: "Forbidden" } });
  });

  it("should return 403 when caller is not the Auth service (Test 4)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/identity",
      headers: {
        authorization: `Bearer ${jwt.sign({ email: "wrong-sa@project.iam.gserviceaccount.com" }, "test-secret")}`,
      },
      body: {
        email: "test@example.com",
        first_name: "",
        last_name: "",
        identity_type: "person",
      },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body).toEqual({ error: { message: "Forbidden" } });
  });

  it("should return 400 when email is missing (Test 5)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/identity",
      headers: {
        authorization: authToken(),
      },
      body: {
        first_name: "",
        last_name: "",
        identity_type: "person",
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.message).toContain("email");
  });

  it("should return 400 when identity_type is invalid (Test 6)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/identity",
      headers: {
        authorization: authToken(),
      },
      body: {
        email: "test@example.com",
        first_name: "",
        last_name: "",
        identity_type: "org",
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.message).toContain("identity_type");
  });
});
