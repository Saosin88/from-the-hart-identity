import { FastifyInstance } from "fastify";
import {
  CreateIdentityRequestSchema,
  CreateIdentityResponseSchema,
  UpdateIdentityRequestSchema,
  IdentityRecordSchema,
  HealthCheckResponseSchema,
  ErrorResponseSchema,
} from "../models/IdentitySchemas";
import { createIdentityController } from "../controllers/identityController";
import { domainAuth } from "../preHandlers/domainAuth";
import { verifyAuthServiceCaller } from "../preHandlers/authServiceCaller";
import { IdentityService } from "../services/identityService";
import { Firestore } from "firebase-admin/firestore";

export default async function identityRoutes(
  fastify: FastifyInstance,
  opts: { firestore: Firestore }
) {
  const { firestore } = opts;
  const identityService = new IdentityService(firestore);
  const controller = createIdentityController(identityService);

  // GET /identity/health — domain health check (follows Auth pattern: /auth/health)
  fastify.get("/identity/health", {
    schema: {
      description: "Health check endpoint for the Identity service. Follows the same pattern as /auth/health.",
      summary: "Identity service health check",
      response: {
        200: {
          type: "object",
          properties: {
            data: HealthCheckResponseSchema,
          },
        },
      },
    },
    handler: controller.checkHealth,
  });

  // POST /identity — Auth service only (verified by preHandler)
  fastify.post("/identity", {
    schema: {
      description:
        "Create a new Identity record. Only callable by the Auth service.",
      summary: "Create Identity",
      body: CreateIdentityRequestSchema,
      response: {
        201: {
          description: "Identity created successfully",
          type: "object",
          properties: {
            data: CreateIdentityResponseSchema,
          },
        },
        400: {
          description: "Invalid request body",
          type: "object",
          properties: {
            error: ErrorResponseSchema,
          },
        },
        403: {
          description: "Caller is not authorized to create identities",
          type: "object",
          properties: {
            error: ErrorResponseSchema,
          },
        },
      },
    },
    preHandler: verifyAuthServiceCaller,
    handler: controller.createIdentity,
  });

  // GET /identity/:identity_id — requires JWT with role on identity
  fastify.get("/identity/:identity_id", {
    schema: {
      description:
        "Get an Identity record by ID. Requires a role on the identity.",
      summary: "Get Identity",
      params: {
        type: "object",
        properties: {
          identity_id: {
            type: "string",
            format: "uuid",
            description: "UUID of the identity to retrieve",
          },
        },
        required: ["identity_id"],
      },
      response: {
        200: {
          description: "Identity record",
          type: "object",
          properties: {
            data: IdentityRecordSchema,
          },
        },
        400: {
          description: "Invalid identity_id format",
          type: "object",
          properties: {
            error: ErrorResponseSchema,
          },
        },
        401: {
          description: "Missing or invalid JWT",
          type: "object",
          properties: {
            error: ErrorResponseSchema,
          },
        },
        404: {
          description: "Identity not found or caller has no role on it",
          type: "object",
          properties: {
            error: ErrorResponseSchema,
          },
        },
      },
    },
    preHandler: domainAuth,
    handler: controller.getIdentity,
  });

  // PATCH /identity/:identity_id — requires owner role
  fastify.patch("/identity/:identity_id", {
    schema: {
      description: "Update an Identity record. Requires the owner role.",
      summary: "Update Identity",
      params: {
        type: "object",
        properties: {
          identity_id: {
            type: "string",
            format: "uuid",
            description: "UUID of the identity to update",
          },
        },
        required: ["identity_id"],
      },
      body: UpdateIdentityRequestSchema,
      response: {
        200: {
          description: "Updated identity record",
          type: "object",
          properties: {
            data: IdentityRecordSchema,
          },
        },
        400: {
          description: "Invalid request body or identity_id",
          type: "object",
          properties: {
            error: ErrorResponseSchema,
          },
        },
        403: {
          description: "Caller does not have the owner role",
          type: "object",
          properties: {
            error: ErrorResponseSchema,
          },
        },
        404: {
          description: "Identity not found",
          type: "object",
          properties: {
            error: ErrorResponseSchema,
          },
        },
      },
    },
    preHandler: domainAuth,
    handler: controller.updateIdentity,
  });
}
