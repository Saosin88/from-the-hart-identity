import { FastifyReply, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { logger } from "../config/logger";

export async function verifyAuthServiceCaller(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const callerEmail = extractCallerEmail(request);

  logger.info(
    {
      callerEmail,
      expectedEmail: config.authServiceAccount,
      hasGoogleHeader: !!request.headers["x-goog-authenticated-user-email"],
      hasServerlessHeader: !!request.headers["x-serverless-authorization"],
      hasAuthHeader: !!request.headers.authorization,
    },
    "verifyAuthServiceCaller: caller identity check",
  );

  if (!callerEmail || callerEmail !== config.authServiceAccount) {
    reply.code(403).send({ error: { message: "Forbidden" } });
    return;
  }
}

function extractCallerEmail(request: FastifyRequest): string | null {
  // Cloud Run IAM injects this header for authorized requests
  const userHeader = request.headers[
    "x-goog-authenticated-user-email"
  ] as string | undefined;
  if (userHeader) {
    // Format: "accounts.google.com:sa@project.iam.gserviceaccount.com"
    // Strip the "accounts.google.com:" prefix
    const colonIndex = userHeader.lastIndexOf(":");
    return colonIndex >= 0
      ? userHeader.substring(colonIndex + 1)
      : userHeader;
  }

  // Fallback: decode X-Serverless-Authorization JWT to extract email
  const serverlessAuth = request.headers[
    "x-serverless-authorization"
  ] as string | undefined;
  if (serverlessAuth?.startsWith("Bearer ")) {
    const token = serverlessAuth.split(" ")[1];
    if (token) {
      try {
        const payload = jwt.decode(token) as Record<string, unknown> | null;
        if (payload && typeof payload === "object") {
          return (payload?.email as string) || (payload?.sub as string) || null;
        }
      } catch {
        // Malformed token — not a 500 error, just fail auth
        return null;
      }
    }
  }

  return null;
}
