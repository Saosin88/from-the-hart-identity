import { FastifyReply, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";

// Augment FastifyRequest to carry caller roles
declare module "fastify" {
  interface FastifyRequest {
    callerRoles?: string[];
  }
}

export async function domainAuth(
  request: FastifyRequest<{ Params: { identity_id: string } }>,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    reply.code(401).send({ error: { message: "Unauthorized" } });
    return;
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    reply.code(401).send({ error: { message: "Unauthorized" } });
    return;
  }

  // jwt.decode() — parses without crypto verification (gateway already validated)
  // Correctly handles base64url encoding (RFC 4648 §5), malformed tokens, edge cases.
  // No firebase-admin, no JWKS, no verify() — parse only.
  let payload: Record<string, unknown> | null = null;
  try {
    payload = jwt.decode(token) as Record<string, unknown> | null;
  } catch {
    reply.code(401).send({ error: { message: "Unauthorized" } });
    return;
  }

  if (!payload || typeof payload !== "object") {
    reply.code(401).send({ error: { message: "Unauthorized" } });
    return;
  }

  const identities = payload.identities;
  if (!identities || typeof identities !== "object" || Array.isArray(identities)) {
    reply.code(401).send({ error: { message: "Unauthorized" } });
    return;
  }

  const identitiesMap = identities as Record<string, string[]>;
  const requestedId = request.params.identity_id;

  // For GET: caller must have any role on the Identity
  // For PATCH: caller must have a role (owner check happens in controller)
  if (!identitiesMap[requestedId]) {
    // Don't reveal existence — return 404 as if Identity doesn't exist
    reply.code(404).send({ error: { message: "Identity not found" } });
    return;
  }

  // Store the roles for downstream checks (e.g., PATCH owner check)
  request.callerRoles = identitiesMap[requestedId];
}
