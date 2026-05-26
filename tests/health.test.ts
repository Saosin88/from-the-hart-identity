import { describe, it, expect, beforeAll } from "vitest";
import { buildApp } from "../src/app";

describe("GET /health", () => {
  let app: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    // No Firestore needed — health is always registered
    app = buildApp();
    await app.ready();
  });

  it("should return 200 with health data (Test 1)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/health",
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
