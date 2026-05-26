import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { buildApp } from "../src/app";
import { createMockJwt } from "./jwtHelper";
import { createMockFirestore } from "./mockFirestore";
import type { IdentityRecord } from "../src/models/IdentitySchemas";

const TEST_IDENTITY_ID = "550e8400-e29b-41d4-a716-446655440000";
const OTHER_IDENTITY_ID = "660e8400-e29b-41d4-a716-446655440001";

function makeGetRequest(
  app: ReturnType<typeof buildApp>,
  identityId: string,
  jwtPayload: Record<string, unknown>
) {
  return app.inject({
    method: "GET",
    url: `/identity/${identityId}`,
    headers: {
      authorization: `Bearer ${createMockJwt(jwtPayload)}`,
    },
  });
}

describe("GET /identity/:identity_id", () => {
  let app: ReturnType<typeof buildApp>;
  let mock: ReturnType<typeof createMockFirestore>;

  beforeAll(() => {
    mock = createMockFirestore();
    app = buildApp(mock.firestore as any);
  });

  beforeEach(() => {
    mock.store.clear();
  });

  it("should return identity when caller has a role (Test 7)", async () => {
    // Seed the store with an identity
    const identity: IdentityRecord = {
      identity_id: TEST_IDENTITY_ID,
      email: "sheldon@example.com",
      first_name: "Sheldon",
      last_name: "Hart",
      identity_type: "person",
      created_at: "2026-05-24T12:00:00.000Z",
      updated_at: "2026-05-24T12:00:00.000Z",
    };
    mock.store.set(TEST_IDENTITY_ID, identity);

    const res = await makeGetRequest(app, TEST_IDENTITY_ID, {
      sub: "user123",
      identities: { [TEST_IDENTITY_ID]: ["viewer"] },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toEqual({ data: identity });

    // Verify Cache-Control header
    expect(res.headers["cache-control"]).toBe("public, max-age=300");
  });

  it("should return 404 when caller has no role (Test 8)", async () => {
    mock.store.set(TEST_IDENTITY_ID, {
      identity_id: TEST_IDENTITY_ID,
      email: "sheldon@example.com",
      first_name: "Sheldon",
      last_name: "Hart",
      identity_type: "person",
      created_at: "2026-05-24T12:00:00.000Z",
      updated_at: "2026-05-24T12:00:00.000Z",
    });

    const res = await makeGetRequest(app, TEST_IDENTITY_ID, {
      sub: "user123",
      identities: { "other-id": ["viewer"] },
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body).toEqual({ error: { message: "Identity not found" } });
  });

  it("should return 404 when identity does not exist in Firestore (Test 9)", async () => {
    // Store is empty — no identity seeded
    const res = await makeGetRequest(app, TEST_IDENTITY_ID, {
      sub: "user123",
      identities: { [TEST_IDENTITY_ID]: ["owner"] },
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body).toEqual({ error: { message: "Identity not found" } });
  });

  it("should return 400 when identity_id is not a valid UUID (Test 10)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/identity/not-a-uuid",
      headers: {
        authorization: `Bearer ${createMockJwt({
          sub: "user123",
          identities: { "not-a-uuid": ["owner"] },
        })}`,
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("should return 401 when no JWT is provided (Test 11)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/identity/${TEST_IDENTITY_ID}`,
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body).toEqual({ error: { message: "Unauthorized" } });
  });
});
