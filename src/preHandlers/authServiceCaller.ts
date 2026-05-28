import { FastifyReply, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import { config } from "../config";

export async function verifyAuthServiceCaller(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const callerEmail = extractCallerEmail(request);

  if (!callerEmail || callerEmail !== config.authServiceAccount) {
    reply.code(403).send({ error: { message: "Forbidden" } });
    return;
  }
}

function extractCallerEmail(request: FastifyRequest): string | null {
  // Auth sends a Google ID token via the Authorization header.
  // Cloud Run IAM validates it at the edge but does NOT inject
  // x-goog-authenticated-user-email for service-to-service calls.
  // Decode the JWT directly to extract the email claim.
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    return null;
  }

  try {
    const payload = jwt.decode(token) as Record<string, unknown> | null;
    if (payload && typeof payload === "object") {
      return (payload.email as string) || null;
    }
  } catch {
    return null;
  }

  return null;
}
