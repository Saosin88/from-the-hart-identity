/**
 * Creates a mock JWT token for testing purposes.
 *
 * This creates a valid base64url-encoded JWT with no cryptographic signature.
 * The Identity service uses jwt.decode() which parses without verification,
 * so any well-formed JWT will pass the parsing step.
 *
 * Format: header.payload.signature (all base64url-encoded)
 */
export function createMockJwt(payload: Record<string, unknown>): string {
  const header = {
    alg: "none",
    typ: "JWT",
  };

  const headerBase64 = base64urlEncode(JSON.stringify(header));
  const payloadBase64 = base64urlEncode(JSON.stringify(payload));
  const signature = ""; // No signature — jwt.decode() doesn't verify

  return `${headerBase64}.${payloadBase64}.${signature}`;
}

function base64urlEncode(data: string): string {
  // Standard base64 → base64url: replace +/ with -_, strip padding
  return Buffer.from(data, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
