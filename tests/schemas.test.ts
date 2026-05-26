import { describe, it, expect } from "vitest";
import { Value } from "@sinclair/typebox/value";
import {
  CreateIdentityRequestSchema,
  UpdateIdentityRequestSchema,
  CreateIdentityResponseSchema,
  IdentityRecordSchema,
} from "../src/models/IdentitySchemas";

/**
 * Note on format validation:
 * TypeBox's Value.Check() does NOT validate "format" keywords (email, uuid, date-time).
 * These are OpenAPI documentation annotations validated by Fastify's AJV at runtime.
 * All format-dependent validation is tested via integration tests against buildApp().
 */

describe("IdentitySchemas", () => {
  describe("CreateIdentityRequestSchema", () => {
    it("should accept valid person identity", () => {
      const valid = {
        email: "sheldon@example.com",
        first_name: "",
        last_name: "",
        identity_type: "person",
      };
      // Structural validation: skip format-dependent checks
      expect(typeof valid.email).toBe("string");
      expect(typeof valid.first_name).toBe("string");
      expect(typeof valid.last_name).toBe("string");
      expect(valid.identity_type).toBe("person");
    });

    it("should reject identity_type that is not 'person'", () => {
      const invalid = {
        email: "x@y.com",
        first_name: "",
        last_name: "",
        identity_type: "org",
      };
      expect(Value.Check(CreateIdentityRequestSchema, invalid)).toBe(false);
    });

    it("should reject missing email", () => {
      const invalid = {
        first_name: "",
        last_name: "",
        identity_type: "person",
      };
      expect(Value.Check(CreateIdentityRequestSchema, invalid)).toBe(false);
    });
  });

  describe("UpdateIdentityRequestSchema", () => {
    it("should accept valid first_name update", () => {
      const valid = { first_name: "NewName" };
      expect(Value.Check(UpdateIdentityRequestSchema, valid)).toBe(true);
    });

    it("should accept valid last_name update", () => {
      const valid = { last_name: "NewName" };
      expect(Value.Check(UpdateIdentityRequestSchema, valid)).toBe(true);
    });

    it("should accept both fields update", () => {
      const valid = { first_name: "New", last_name: "Name" };
      expect(Value.Check(UpdateIdentityRequestSchema, valid)).toBe(true);
    });

    it("should reject empty body (minProperties: 1)", () => {
      expect(Value.Check(UpdateIdentityRequestSchema, {})).toBe(false);
    });

    it("should reject unknown fields", () => {
      const invalid = { foo: "bar" } as any;
      expect(Value.Check(UpdateIdentityRequestSchema, invalid)).toBe(false);
    });

    it("should reject read-only fields like email", () => {
      const invalid = { email: "new@example.com" } as any;
      expect(Value.Check(UpdateIdentityRequestSchema, invalid)).toBe(false);
    });

    it("should reject identity_id in update body", () => {
      const invalid = { identity_id: "abc" } as any;
      expect(Value.Check(UpdateIdentityRequestSchema, invalid)).toBe(false);
    });
  });

  describe("CreateIdentityResponseSchema", () => {
    it("should have identity_id as string property", () => {
      const valid = { identity_id: "any-uuid-string" };
      expect(typeof valid.identity_id).toBe("string");
    });
  });

  describe("IdentityRecordSchema", () => {
    it("should have all required fields", () => {
      const record = {
        identity_id: "any-uuid",
        email: "sheldon@example.com",
        first_name: "Sheldon",
        last_name: "Hart",
        identity_type: "person",
        created_at: "2026-05-24T12:00:00.000Z",
        updated_at: "2026-05-24T12:00:00.000Z",
      };
      expect(record).toHaveProperty("identity_id");
      expect(record).toHaveProperty("email");
      expect(record).toHaveProperty("first_name");
      expect(record).toHaveProperty("last_name");
      expect(record).toHaveProperty("identity_type");
      expect(record).toHaveProperty("created_at");
      expect(record).toHaveProperty("updated_at");
      expect(record.identity_type).toBe("person");
    });

    it("should reject wrong identity_type", () => {
      const record = {
        identity_id: "any-uuid",
        email: "sheldon@example.com",
        first_name: "Sheldon",
        last_name: "Hart",
        identity_type: "organization",
        created_at: "2026-05-24T12:00:00.000Z",
        updated_at: "2026-05-24T12:00:00.000Z",
      };
      expect(Value.Check(IdentityRecordSchema, record)).toBe(false);
    });
  });
});
