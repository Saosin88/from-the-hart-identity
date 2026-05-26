import { describe, it, expect, beforeAll } from "vitest";
import { buildApp } from "../src/app";

describe("Config module", () => {
  it("should load AUTH_SERVICE_ACCOUNT_EMAIL from env", () => {
    // setup.ts sets this in test
    expect(process.env.AUTH_SERVICE_ACCOUNT_EMAIL).toBe(
      "auth-sa@test-project.iam.gserviceaccount.com"
    );
  });

  it("should get config.authServiceAccount from env", async () => {
    // Re-import config fresh after env is set by setup.ts
    const { config } = await import("../src/config");
    expect(config.authServiceAccount).toBe(
      "auth-sa@test-project.iam.gserviceaccount.com"
    );
  });

  it("Swagger should register at /identity/documentation", async () => {
    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: "GET",
      url: "/identity/documentation",
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("swagger");

    await app.close();
  });
});
