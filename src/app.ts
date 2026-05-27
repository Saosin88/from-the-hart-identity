import fastify, { FastifyInstance, FastifyError } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import type { Firestore } from "firebase-admin/firestore";
import { registerSwagger } from "./config/swagger";
import { fastifyLogger } from "./config/logger";
import { initializeFirestore } from "./services/firestore";
import { registerIdentityRoutes } from "./routes/identity";

export function buildApp(firestore?: Firestore): FastifyInstance {
  const app = fastify({
    logger: fastifyLogger,
    ajv: {
      customOptions: {
        removeAdditional: false,
      },
    },
  });

  app.withTypeProvider<TypeBoxTypeProvider>();

  registerSwagger(app);

  // Use provided Firestore instance (for tests) or initialize from config
  const db = firestore || (process.env.NODE_ENV !== "test" ? initializeFirestore() : undefined);
  if (db) {
    registerIdentityRoutes(app, db);
  }

  // Health endpoint is registered in identity.ts under /identity/health — same pattern as Auth (/auth/health)

  app.setErrorHandler<FastifyError>((error, request, reply) => {
    if (error.validation) {
      reply.status(400).send({
        error: {
          message: error.message || "Validation error",
        },
      });
    } else {
      reply.status(error.statusCode || 500).send({
        error: {
          message: error.message || "Internal server error",
        },
      });
    }
  });

  return app;
}
