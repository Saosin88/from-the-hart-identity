import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { buildApp } from "../src/app";
import { createMockJwt } from "./jwtHelper";
import { createMockFirestore } from "./mockFirestore";
import type { IdentityRecord } from "../src/models/IdentitySchemas";

const TEST_IDENTITY_ID = "550e8400-e29b-41d4-a716-446655440000";

function makePatchRequest(
  app: ReturnType<typeof buildApp>,
  identityId: string,
  jwtPayload: Record<string, unknown>,
  body: Record<string, unknown>
) {
  return app.inject({
    method: "PATCH",
    url: `/identity/${identityId}`,
    headers: {
      authorization: `Bearer ${createMockJwt(jwtPayload)}`,
    },
    body,
  });
}

describe("PATCH /identity/:identity_id", () => {
  let app: ReturnType<typeof buildApp>;
  let mock: ReturnType<typeof createMockFirestore>;

  beforeAll(() => {
    mock = createMockFirestore();
    app = buildApp(mock.firestore as any);
  });

  beforeEach(() => {
    mock.store.clear();
  });

  const baseIdentity: IdentityRecord = {
    identity_id: TEST_IDENTITY_ID,
    email: "sheldon@example.com",
    first_name: "Sheldon",
    last_name: "Hart",
    identity_type: "person",
    created_at: "2026-05-24T12:00:00.000Z",
    updated_at: "2026-05-24T12:00:00.000Z",
  };

  it("should update identity when caller is owner (Test 12)", async () => {
    mock.store.set(TEST_IDENTITY_ID, { ...baseIdentity });

    const res = await makePatchRequest(
      app,
      TEST_IDENTITY_ID,
      {
        sub: "user123",
        identities: { [TEST_IDENTITY_ID]: ["owner"] },
      },
      { first_name: "Updated" }
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.first_name).toBe("Updated");

    // Verify other fields unchanged
    expect(body.data.last_name).toBe("Hart");
    expect(body.data.email).toBe("sheldon@example.com");

    // Verify updated_at was bumped
    expect(body.data.updated_at).not.toBe(baseIdentity.updated_at);

    // Verify Cache-Control header
    expect(res.headers["cache-control"]).toBe("no-cache");
  });

  it("should return 403 when caller is viewer, not owner (Test 13)", async () => {
    mock.store.set(TEST_IDENTITY_ID, { ...baseIdentity });

    const res = await makePatchRequest(
      app,
      TEST_IDENTITY_ID,
      {
        sub: "user123",
        identities: { [TEST_IDENTITY_ID]: ["viewer"] },
      },
      { first_name: "Hacked" }
    );

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body).toEqual({
      error: { message: "Only the owner can modify this identity" },
    });

    // Verify the identity was NOT updated
    expect(mock.store.get(TEST_IDENTITY_ID)?.first_name).toBe("Sheldon");
  });

  it("should return 400 when PATCH contains unknown fields (Test 14)", async () => {
    mock.store.set(TEST_IDENTITY_ID, { ...baseIdentity });

    const res = await makePatchRequest(
      app,
      TEST_IDENTITY_ID,
      {
        sub: "user123",
        identities: { [TEST_IDENTITY_ID]: ["owner"] },
      },
      { foo: "bar" }
    );

    expect(res.statusCode).toBe(400);
  });

  it("should return 400 when PATCH body is empty (Test 15)", async () => {
    mock.store.set(TEST_IDENTITY_ID, { ...baseIdentity });

    const res = await makePatchRequest(
      app,
      TEST_IDENTITY_ID,
      {
        sub: "user123",
        identities: { [TEST_IDENTITY_ID]: ["owner"] },
      },
      {}
    );

    expect(res.statusCode).toBe(400);
  });

  it("should preserve email when updating first_name", async () => {
    mock.store.set(TEST_IDENTITY_ID, { ...baseIdentity });

    const res = await makePatchRequest(
      app,
      TEST_IDENTITY_ID,
      {
        sub: "user123",
        identities: { [TEST_IDENTITY_ID]: ["owner"] },
      },
      { first_name: "NewFirst" }
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.email).toBe("sheldon@example.com");
  });

  it("should return 404 when identity does not exist", async () => {
    // No identity seeded — store is empty

    const res = await makePatchRequest(
      app,
      TEST_IDENTITY_ID,
      {
        sub: "user123",
        identities: { [TEST_IDENTITY_ID]: ["owner"] },
      },
      { first_name: "Ghost" }
    );

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body).toEqual({ error: { message: "Identity not found" } });
  });

  it("should allow clearing first_name to empty string", async () => {
    mock.store.set(TEST_IDENTITY_ID, { ...baseIdentity });

    const res = await makePatchRequest(
      app,
      TEST_IDENTITY_ID,
      {
        sub: "user123",
        identities: { [TEST_IDENTITY_ID]: ["owner"] },
      },
      { first_name: "" }
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.first_name).toBe("");
  });
});
