import { Type, Static } from "@sinclair/typebox";

export const IdentityRecordSchema = Type.Object({
  identity_id: Type.String({
    format: "uuid",
    description: "Unique identifier for the identity",
    examples: ["550e8400-e29b-41d4-a716-446655440000"],
  }),
  email: Type.String({
    format: "email",
    minLength: 5,
    maxLength: 254,
    description: "Email address of the identity (immutable after creation)",
    examples: ["sheldon@example.com"],
  }),
  first_name: Type.String({
    description: "First name of the identity",
    examples: ["Sheldon"],
  }),
  last_name: Type.String({
    description: "Last name of the identity",
    examples: ["Hart"],
  }),
  identity_type: Type.Literal("person", {
    description: "Type of identity (only 'person' supported)",
    examples: ["person"],
  }),
  created_at: Type.String({
    format: "date-time",
    description: "ISO 8601 timestamp of when the identity was created",
    examples: ["2026-05-24T12:00:00.000Z"],
  }),
  updated_at: Type.String({
    format: "date-time",
    description: "ISO 8601 timestamp of the last update",
    examples: ["2026-05-24T12:00:00.000Z"],
  }),
});

export type IdentityRecord = Static<typeof IdentityRecordSchema>;

export const CreateIdentityRequestSchema = Type.Object({
  email: Type.String({
    format: "email",
    minLength: 5,
    maxLength: 254,
    description: "Email address for the new identity",
    examples: ["sheldon@example.com"],
  }),
  first_name: Type.String({
    default: "",
    description: "First name",
    examples: [""],
  }),
  last_name: Type.String({
    default: "",
    description: "Last name",
    examples: [""],
  }),
  identity_type: Type.Literal("person", {
    description: "Type of identity (must be 'person')",
    examples: ["person"],
  }),
});

export type CreateIdentityRequest = Static<typeof CreateIdentityRequestSchema>;

export const CreateIdentityResponseSchema = Type.Object({
  identity_id: Type.String({
    format: "uuid",
    description: "Generated UUID for the new identity",
    examples: ["550e8400-e29b-41d4-a716-446655440000"],
  }),
});

export type CreateIdentityResponse = Static<typeof CreateIdentityResponseSchema>;

export const UpdateIdentityRequestSchema = Type.Object(
  {
    first_name: Type.Optional(
      Type.String({
        description: "Updated first name",
        examples: ["NewFirst"],
      })
    ),
    last_name: Type.Optional(
      Type.String({
        description: "Updated last name",
        examples: ["NewLast"],
      })
    ),
  },
  {
    additionalProperties: false,
    minProperties: 1,
    description:
      "Partial update object with at least one mutable field (first_name, last_name)",
  }
);

export type UpdateIdentityRequest = Static<typeof UpdateIdentityRequestSchema>;

export const HealthCheckResponseSchema = Type.Object({
  status: Type.String({
    description: "Service status",
    examples: ["ok"],
  }),
  uptime: Type.Number({
    description: "Service uptime in seconds",
    examples: [123.45],
  }),
  timestamp: Type.Number({
    description: "Current server timestamp (ms since epoch)",
    examples: [1716123456789],
  }),
});

export type HealthCheckResponse = Static<typeof HealthCheckResponseSchema>;

export const ErrorResponseSchema = Type.Object({
  message: Type.String({
    description: "Error message",
    examples: ["Identity not found"],
  }),
});

export type ErrorResponse = Static<typeof ErrorResponseSchema>;
