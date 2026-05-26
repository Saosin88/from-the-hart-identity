import { FastifyReply, FastifyRequest } from "fastify";
import { IdentityService } from "../services/identityService";
import { logger } from "../config/logger";

export function createIdentityController(identityService: IdentityService) {
  return {
    checkHealth: async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.code(200).send({
        data: {
          status: "ok",
          uptime: process.uptime(),
          timestamp: Date.now(),
        },
      });
    },

    createIdentity: async (
      request: FastifyRequest<{
        Body: {
          email: string;
          first_name: string;
          last_name: string;
          identity_type: "person";
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const result = await identityService.createIdentity(request.body);
        return reply.code(201).send({ data: result });
      } catch (error) {
        logger.error(
          { operation: "createIdentity", error },
          "Controller: createIdentity failed"
        );
        return reply
          .code(500)
          .send({ error: { message: "Internal server error" } });
      }
    },

    getIdentity: async (
      request: FastifyRequest<{ Params: { identity_id: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const identity = await identityService.getIdentity(
          request.params.identity_id
        );

        if (!identity) {
          return reply
            .code(404)
            .send({ error: { message: "Identity not found" } });
        }

        reply.header("Cache-Control", "public, max-age=300");
        return reply.code(200).send({ data: identity });
      } catch (error) {
        logger.error(
          { operation: "getIdentity", identityId: request.params.identity_id, error },
          "Controller: getIdentity failed"
        );
        return reply
          .code(500)
          .send({ error: { message: "Internal server error" } });
      }
    },

    updateIdentity: async (
      request: FastifyRequest<{
        Params: { identity_id: string };
        Body: { first_name?: string; last_name?: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        // Check caller has owner role (domainAuth already verified they have some role)
        const roles = request.callerRoles;
        if (!roles || !roles.includes("owner")) {
          return reply
            .code(403)
            .send({
              error: { message: "Only the owner can modify this identity" },
            });
        }

        const identity = await identityService.updateIdentity(
          request.params.identity_id,
          request.body
        );

        if (!identity) {
          return reply
            .code(404)
            .send({ error: { message: "Identity not found" } });
        }

        reply.header("Cache-Control", "no-cache");
        return reply.code(200).send({ data: identity });
      } catch (error) {
        logger.error(
          { operation: "updateIdentity", identityId: request.params.identity_id, error },
          "Controller: updateIdentity failed"
        );
        return reply
          .code(500)
          .send({ error: { message: "Internal server error" } });
      }
    },
  };
}
