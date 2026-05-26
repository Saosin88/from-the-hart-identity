import { describe, it, expect, beforeAll } from "vitest";
import { buildApp } from "../src/app";
import { createMockJwt } from "./jwtHelper";
import { createMockFirestore } from "./mockFirestore";

describe("Domain Auth PreHandler", () => {
  let app: ReturnType<typeof buildApp>;
  let mock: ReturnType<typeof createMockFirestore>;

  beforeAll(() => {
    mock = createMockFirestore();
    app = buildApp(mock.firestore as any);
  });

  it("should return 401 when no Authorization header is present", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/identity/550e8400-e29b-41d4-a716-446655440000",
    });

    expect(res.statusCode).toBe(401);
  });

  it("should return 401 when Authorization header is not Bearer", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/identity/550e8400-e29b-41d4-a716-446655440000",
      headers: {
        authorization: "Basic abc123",
      },
    });

    expect(res.statusCode).toBe(401);
  });

  it("should return 401 when token has no identities claim", async () => {
    const token = createMockJwt({ sub: "user123" });

    const res = await app.inject({
      method: "GET",
      url: "/identity/550e8400-e29b-41d4-a716-446655440000",
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(res.statusCode).toBe(401);
  });

  it("should return 404 when caller has no role on the requested identity", async () => {
    const token = createMockJwt({
      identities: { "other-id": ["owner"] },
    });

    const res = await app.inject({
      method: "GET",
      url: "/identity/550e8400-e29b-41d4-a716-446655440000",
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(res.statusCode).toBe(404);
  });

  it("should return 404 when identities map is empty", async () => {
    const token = createMockJwt({
      identities: {},
    });

    const res = await app.inject({
      method: "GET",
      url: "/identity/550e8400-e29b-41d4-a716-446655440000",
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(res.statusCode).toBe(404);
  });
});
