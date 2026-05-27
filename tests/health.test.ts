import { describe, it, expect, beforeAll } from "vitest";
import { buildApp } from "../src/app";
import { createMockFirestore } from "./mockFirestore";

describe("GET /identity/health", () => {
  let app: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    const { firestore: mockDb } = createMockFirestore();
    app = buildApp(mockDb as any);
    await app.ready();
  });

  it("should return 200 with health data (Test 1)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/identity/health",
    });

    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body);
    expect(body).toHaveProperty("data");
    expect(body.data).toHaveProperty("status", "ok");
    expect(body.data).toHaveProperty("uptime");
    expect(typeof body.data.uptime).toBe("number");
    expect(body.data).toHaveProperty("timestamp");
    expect(typeof body.data.timestamp).toBe("number");
  });
});
