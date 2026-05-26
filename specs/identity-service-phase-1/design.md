# Identity Service Phase 1 — Design

> **Requirements:** [requirements.md](./requirements.md)
> **Architecture:** [Identity & Access Architecture](../../docs/architecture/identity-and-access.md)
> **Ref impl:** `from-the-hart-auth` — follow its project structure and conventions exactly.

---

## Table of Contents

1. [Project Structure](#project-structure)
2. [Module Design](#module-design)
3. [Data Model](#data-model)
4. [Route Contracts](#route-contracts)
5. [Domain Authorization](#domain-authorization)
6. [Caller Verification (POST /identity)](#caller-verification-post-identity)
7. [Configuration](#configuration)
8. [Error Handling](#error-handling)
9. [Dependencies](#dependencies)
10. [Deviation from Auth Service](#deviation-from-auth-service)

---

## Project Structure

Mirrors `from-the-hart-auth` exactly:

```
from-the-hart-identity/
├── src/
│   ├── config/
│   │   ├── index.ts          # Environment-based config
│   │   ├── logger.ts         # Pino logger + Fastify plugin
│   │   └── swagger.ts        # OpenAPI registration
│   ├── controllers/
│   │   └── identityController.ts  # Route handlers (thin)
│   ├── models/
│   │   └── IdentitySchemas.ts     # TypeBox schemas
│   ├── routes/
│   │   └── identity.ts           # Route definitions with schemas
│   ├── services/
│   │   ├── identityService.ts    # Firestore CRUD operations
│   │   └── firestore.ts          # Firebase Admin init (Firestore only)
│   ├── preHandlers/
│   │   └── domainAuth.ts         # JWT decode + identities claim check
│   ├── app.ts                    # buildApp() factory
│   └── server.ts                 # Local dev entry point
├── tests/
│   ├── health.test.ts
│   ├── identity-create.test.ts
│   ├── identity-get.test.ts
│   ├── identity-update.test.ts
│   └── domainAuth.test.ts
├── Dockerfile
├── tsconfig.json
├── package.json
├── CONTEXT.md
└── AGENTS.md
```

**Convention:** 2018 module style (no `mod.rs` equivalent — just `foo.ts` files in dirs). Matches Fastify services convention from master AGENTS.md.

---

## Module Design

### config/index.ts

Typed config from environment variables. Same pattern as Auth:

```typescript
export const config = {
  env: process.env.NODE_ENV || "local",
  logLevel: process.env.LOG_LEVEL || "info",
  server: {
    port: process.env.PORT ? parseInt(process.env.PORT, 10) : 8080,
    host: process.env.HOST || "0.0.0.0",
  },
  firestore: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    databaseName: process.env.FIRESTORE_DATABASE_NAME || "identity",
    // Service account: read from env var (Cloud Run) or file (local dev)
  },
  authServiceAccount: process.env.AUTH_SERVICE_ACCOUNT_EMAIL,
  // ^ The email of the Auth service's Cloud Run service account.
  //   Used to verify POST /identity callers.
};
```

**Required env vars:**
| Variable | Purpose |
|----------|---------|
| `FIREBASE_PROJECT_ID` | GCP project ID |
| `SERVICE_ACCOUNT_PRIVATE_KEY` | Service account key for Firestore access |
| `FIREBASE_CLIENT_EMAIL` | Service account email (pair with private key) |
| `AUTH_SERVICE_ACCOUNT_EMAIL` | Auth service's service account email — the only caller allowed for `POST /identity` |

### config/logger.ts

Identical to Auth's logger — pino with pino-pretty for local dev, structured JSON for production. Exports `logger` and `fastifyLogger`.

### config/swagger.ts

OpenAPI at `/identity/documentation`. Same pattern as Auth but with Identity-specific metadata:

```typescript
app.register(fastifySwagger, {
  openapi: {
    info: {
      title: "From The Hart Identity API",
      version: "1.0.0",
    },
    servers: [
      { url: "http://localhost:8080", description: "Local server" },
    ],
  },
});

app.register(fastifySwaggerUi, {
  routePrefix: "/identity/documentation",
  uiConfig: {
    docExpansion: "list",
    deepLinking: true,
  },
  // Same logo as Auth
});
```

### services/firestore.ts

Initializes `firebase-admin` with **only Firestore** — no auth functions. Uses named database `"identity"`. Same location as Auth's `services/firebase.ts`.

```typescript
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export function initializeFirestore(): Firestore {
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: config.firestore.projectId,
        clientEmail: config.firestore.clientEmail,
        privateKey: config.firestore.privateKey,
      }),
    });
  }
  return getFirestore(config.firestore.databaseName);
}
```

**Design note:** The Identity service uses a dedicated service account — separate from Auth's. Least privilege: this service account only has Firestore access to the `"identity"` database, nothing else.

### services/identityService.ts

Pure CRUD operations on Firestore. No HTTP concerns, no auth logic. Receives plain data, returns plain data.

```typescript
export interface IdentityService {
  createIdentity(data: CreateIdentityDto): Promise<{ identity_id: string }>;
  getIdentity(identityId: string): Promise<IdentityRecord | null>;
  updateIdentity(identityId: string, data: UpdateIdentityDto): Promise<IdentityRecord>;
}
```

**Implementation:**
- `createIdentity()`: Generates UUID via `crypto.randomUUID()`, sets `created_at`/`updated_at`, writes to Firestore `identities/{identity_id}`.
- `getIdentity()`: Reads from Firestore. Returns `null` if not found.
- `updateIdentity()`: Reads the document in a **Firestore transaction** (→ atomic read-write, avoids lost updates on concurrent PATCHes). If not found, returns `null` (controller handles 404). Merges `first_name`/`last_name`, updates `updated_at`, writes back within the transaction. Returns full updated record.

**Firestore error handling:** All Firestore operations are wrapped in try/catch. Transient errors (network, timeout) are logged with context and re-thrown as 500. The Fastify error handler catches unhandled errors and returns `{ error: { message: "Internal server error" } }`. No custom retry logic in Phase 1 — Firestore's client SDK already handles transient retries internally for simple reads/writes. For the `updateIdentity` transaction, Firestore automatically retries on contention.

**Firestore collection:** `identities` — keyed by `identity_id` (UUID string).

### controllers/identityController.ts

Thin handlers — validate input, call service, format response. Pattern from Auth:

```typescript
export const createIdentity = async (request, reply) => {
  const body = request.body; // Already validated by TypeBox schema
  const result = await identityService.createIdentity(body);
  return reply.code(201).send({ data: result });
};

export const getIdentity = async (request, reply) => {
  const { identity_id } = request.params;
  const identity = await identityService.getIdentity(identity_id);
  if (!identity) return reply.code(404).send({ error: { message: "Identity not found" } });
  reply.header("Cache-Control", "public, max-age=300");
  return reply.code(200).send({ data: identity });
};

export const updateIdentity = async (request, reply) => {
  const { identity_id } = request.params;
  const body = request.body;
  const identity = await identityService.updateIdentity(identity_id, body);
  reply.header("Cache-Control", "no-cache");
  return reply.code(200).send({ data: identity });
};

export const checkHealth = async (_request, reply) => {
  return reply.code(200).send({
    data: {
      status: "ok",
      uptime: process.uptime(),
      timestamp: Date.now(),
    },
  });
};
```

**Note on response wrapper:** All Identity endpoints follow the same convention as Auth and Projects: `{ data: ... }` for success, `{ error: { message: "..." } }` for errors. This is a project-wide convention — not up for per-service deviation.

### routes/identity.ts

Route definitions with inline TypeBox schemas — `description`, `summary`, `body` (with examples), `response` (with examples). Registered with prefix `/identity` in `app.ts`.

```
POST   /identity              → identityController.createIdentity
GET    /identity/:identity_id  → identityController.getIdentity
PATCH  /identity/:identity_id  → identityController.updateIdentity
GET    /health                 → identityController.checkHealth
```

**Key schema decisions:**
- `:identity_id` param validated as UUID format via TypeBox `params` schema
- POST body: `{ email: string, first_name: string, last_name: string, identity_type: "person" }`
- PATCH body: `{ first_name?: string, last_name?: string }` — partial, at least one field required. Additional properties forbidden.
- GET/PATCH params: `{ identity_id: string (format: uuid) }`

### preHandlers/domainAuth.ts

Fastify `preHandler` hook for `GET /identity/:identity_id` and `PATCH /identity/:identity_id`.

```typescript
import jwt from "jsonwebtoken";
import { FastifyReply, FastifyRequest } from "fastify";

export async function domainAuth(
  request: FastifyRequest<{ Params: { identity_id: string } }>,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return reply.code(401).send({ error: { message: "Unauthorized" } });
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    return reply.code(401).send({ error: { message: "Unauthorized" } });
  }

  // jwt.decode() — parses without crypto verification (gateway already validated)
  // Correctly handles base64url encoding (RFC 4648 §5), malformed tokens, edge cases.
  // No firebase-admin, no JWKS, no verify() — parse only.
  const payload = jwt.decode(token) as Record<string, unknown> | null;
  if (!payload || !payload.identities) {
    return reply.code(401).send({ error: { message: "Unauthorized" } });
  }

  const identities = payload.identities as Record<string, string[]>;
  const requestedId = request.params.identity_id;

  // For GET: caller must have any role on the Identity
  if (!identities[requestedId]) {
    return reply.code(404).send({ error: { message: "Identity not found" } });
  }

  // Store the roles for downstream checks (e.g., PATCH owner check)
  // NOTE: FastifyRequest is augmented via a type declaration in this module:
  //   declare module 'fastify' { interface FastifyRequest { callerRoles?: string[] } }
  request.callerRoles = identities[requestedId];
}
```

For PATCH, the controller additionally checks `request.callerRoles?.includes("owner")`.

**Type augmentation:** The `domainAuth.ts` module declares the `callerRoles` property on FastifyRequest:

```typescript
declare module 'fastify' {
  interface FastifyRequest {
    callerRoles?: string[];
  }
}
```

This avoids the `(request as any)` type-safety violation and makes the property visible to all route handlers.

**Security: Trusting the Gateway's JWT Validation**

This is the most significant security tradeoff in the design. The Identity service base64-decodes the JWT payload without cryptographic verification — it trusts that the API Gateway already validated the token. **If the gateway is compromised or misconfigured, an attacker could forge a JWT with arbitrary `identities` claims and gain unauthorized access to any Identity.**

**Why this is acceptable:**
- The gateway is the sole public entry point — there is no path for an unauthenticated request to reach Identity
- Cloud Run IAM blocks any request that doesn't include a valid `X-Serverless-Authorization` header (i.e., the gateway's Google ID token)
- An attacker would need to compromise TWO independent systems (Cloud Run IAM + API Gateway) to reach the JWT payload
- The JWT is also validated by the gateway via `/auth/verify-id-token` with `Cache-Control: max-age=600` — even if the JWT were forged, the gateway would detect it within 10 minutes

**Mitigations if risk changes:**
- Add a shared HMAC key between Gateway and Identity — gateway signs the forwarded JWT, Identity verifies
- Use Firebase Admin SDK for JWT verification (adds `firebase-admin` auth dependency to Identity)
- Move authorization checks entirely to the gateway (gateway rejects before forwarding)

**Why `jwt.decode()` instead of manual base64 decoding:**
- JWT uses **base64url** encoding (RFC 4648 §5): `-` instead of `+`, `_` instead of `/`, no `=` padding. `Buffer.from(x, 'base64')` silently corrupts these characters. Node 18+ has `Buffer.from(x, 'base64url')` as a fix, but `jwt.decode()` handles this correctly with zero extra code.
- `jwt.decode()` handles all edge cases: 2-segment tokens, malformed payloads, non-JSON payloads
- Already a direct dependency — same lightweight library used by the Auth service. No new ecosystem.
- Does NOT verify signatures — it's a parsing utility, not a verification library. The `jsonwebtoken` README explicitly calls out `jwt.decode()` for untrusted tokens: "You should not use this for untrusted messages. You most likely want to use jwt.verify instead." That matches our use case: the gateway already verified, we just need to parse.

**No dependency on `firebase-admin` auth functions.** No `adminAuth().verifyIdToken()`. No JWKS fetching. This is by design — the API Gateway already validated the token and Cloud Run IAM authenticated the caller.

**No dependency on `firebase-admin` auth functions.** No `adminAuth().verifyIdToken()`. No JWKS fetching. This is by design — the API Gateway already validated the token and Cloud Run IAM authenticated the caller.

### app.ts

`buildApp()` factory — same pattern as Auth:

```typescript
export function buildApp(): FastifyInstance {
  const app = fastify({ logger: fastifyLogger });
  app.withTypeProvider<TypeBoxTypeProvider>();

  initializeFirestore();
  registerSwagger(app);

  app.register(identityRoutes, { prefix: "/identity" });

  app.setErrorHandler((error, request, reply) => {
    if (error.validation) {
      return reply.status(400).send({
        error: { message: error.message || "Validation error" },
      });
    }
    return reply.status(error.statusCode || 500).send({
      error: { message: error.message || "Internal server error" },
    });
  });

  return app;
}
```

**No `@fastify/cookie`** — Identity service doesn't deal with cookies or token exchange.

### server.ts

Same as Auth:

```typescript
import { buildApp } from "./app";
import { config } from "./config";

const app = buildApp();
const start = async () => {
  try {
    await app.listen({ port: config.server.port, host: config.server.host });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};
start();
```

---

## Data Model

### Firestore Document

Collection: `identities`
Document ID: `identity_id` (UUID string)

```typescript
interface IdentityRecord {
  identity_id: string;    // UUID — also the Firestore document ID
  email: string;          // Immutable after creation
  first_name: string;     // Mutable via PATCH
  last_name: string;      // Mutable via PATCH
  identity_type: "person"; // Only supported value
  created_at: string;     // ISO 8601, set at creation
  updated_at: string;     // ISO 8601, updated on every mutation
}
```

**TypeBox schema:**

```typescript
import { Type, Static } from "@sinclair/typebox";

export const IdentityRecordSchema = Type.Object({
  identity_id: Type.String({ format: "uuid" }),
  email: Type.String({ format: "email" }),
  first_name: Type.String(),
  last_name: Type.String(),
  identity_type: Type.Literal("person"),
  created_at: Type.String({ format: "date-time" }),
  updated_at: Type.String({ format: "date-time" }),
});

export type IdentityRecord = Static<typeof IdentityRecordSchema>;

export const CreateIdentityRequestSchema = Type.Object({
  email: Type.String({ format: "email", minLength: 5, maxLength: 254 }),
  first_name: Type.String({ default: "" }),
  last_name: Type.String({ default: "" }),
  identity_type: Type.Literal("person"),
});

export const CreateIdentityResponseSchema = Type.Object({
  identity_id: Type.String({ format: "uuid" }),
});

export const UpdateIdentityRequestSchema = Type.Object(
  {
    first_name: Type.Optional(Type.String()),
    last_name: Type.Optional(Type.String()),
  },
  {
    additionalProperties: false,
    minProperties: 1,
  }
);
```

**Design note on `additionalProperties: false`:** TypeBox supports this via the options parameter. If TypeBox's `additionalProperties` is not supported, validate unknown fields manually in the controller after TypeBox validation passes. This is essential for FR4.7 — rejecting unknown fields in PATCH.

---

## Route Contracts

### GET /health

| Aspect | Detail |
|--------|--------|
| Auth | None |
| Response (200) | `{ data: { status: "ok", uptime: number, timestamp: number } }` |

### POST /identity

| Aspect | Detail |
|--------|--------|
| Auth | Caller verified as Auth service via Cloud Run IAM header (see § Caller Verification) |
| Body | `{ email, first_name, last_name, identity_type: "person" }` |
| Response (201) | `{ data: { identity_id: "uuid" } }` |
| Response (400) | `{ error: { message: "Missing required fields: email" } }` |
| Response (400) | `{ error: { message: "identity_type must be 'person'" } }` |
| Response (403) | `{ error: { message: "Forbidden" } }` — when caller is not Auth service |

### GET /identity/:identity_id

| Aspect | Detail |
|--------|--------|
| Auth | End-user JWT required (via API Gateway). Domain authorization checks `identities` claim. |
| Params | `identity_id: string (uuid)` |
| Response (200) | `{ data: IdentityRecord }` |
| Response (400) | `{ error: { message: "Invalid identity_id" } }` — when param is not a UUID |
| Response (404) | `{ error: { message: "Identity not found" } }` — not found OR no role (don't reveal existence) |
| Cache | `Cache-Control: public, max-age=300` |

### PATCH /identity/:identity_id

| Aspect | Detail |
|--------|--------|
| Auth | End-user JWT required. Domain authorization: must have `owner` role. |
| Params | `identity_id: string (uuid)` |
| Body | `{ first_name?: string, last_name?: string }` — at least one, no unknown fields |
| Response (200) | `{ data: IdentityRecord }` (full updated record) |
| Response (400) | `{ error: { message: "Invalid identity_id" } }` |
| Response (400) | `{ error: { message: "Unknown fields: foo, bar" } }` |
| Response (403) | `{ error: { message: "Only the owner can modify this identity" } }` — has role but not owner |
| Response (404) | `{ error: { message: "Identity not found" } }` — not found OR no role at all |
| Cache | `Cache-Control: no-cache` |

---

## Domain Authorization

### Two-Layer Check

| Layer | What | Where |
|-------|------|-------|
| **Presence check** | Is the requested `identity_id` in the caller's JWT `identities` map? | `preHandler` hook (domainAuth.ts) |
| **Role check** | Does the caller have the required role (`owner`)? | Controller (PATCH) or preHandler with role param |

### Flow for GET /identity/{id}

```
Request → preHandler: domainAuth
  ├── Extract JWT from Authorization header
  ├── Base64-decode payload
  ├── Check identities[id] exists
  │   └── No → 404 "Identity not found"
  └── Yes → attach roles to request, continue
       └── Controller: fetch Identity from Firestore
            ├── Not in DB → 404
            └── Found → 200 with Cache-Control
```

### Flow for PATCH /identity/{id}

```
Request → preHandler: domainAuth
  ├── Extract JWT from Authorization header
  ├── Base64-decode payload
  ├── Check identities[id] exists
  │   └── No → 404 "Identity not found"
  └── Yes → attach roles to request, continue
       └── Controller: check "owner" in roles
            ├── No → 403 "Only the owner can modify this identity"
            └── Yes → update Firestore → 200 with no-cache
```

### Why Not in preHandler for Role Check?

The preHandler can check presence (all routes need it), but the role check varies: GET needs any role, PATCH needs `owner`. Putting role-specific logic in the controller is clearer than parameterizing the preHandler. If more routes with different role requirements are added later, the controller pattern scales better than "preHandler with config."

---

## Caller Verification (POST /identity)

Only the Auth service may call `POST /identity`. The gateway does not forward this endpoint — it's an internal endpoint.

### Mechanism

When a request arrives via Cloud Run IAM (authenticated by GCP), Cloud Run injects headers:

```
X-Goog-Authenticated-User-Email: accounts.google.com:auth-service@project.iam.gserviceaccount.com
```

Alternatively, if the service uses `X-Serverless-Authorization` header (ID token):

```
X-Serverless-Authorization: Bearer <google_id_token>
```

The preHandler for `POST /identity`:

1. Extract the caller's identity from either `X-Goog-Authenticated-User-Email` (strip `accounts.google.com:` prefix) or decode the `X-Serverless-Authorization` JWT to get the email claim
2. Compare against `config.authServiceAccount`
3. If mismatch → 403

```typescript
export async function verifyAuthServiceCaller(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const callerEmail = extractCallerEmail(request);
  if (callerEmail !== config.authServiceAccount) {
    return reply.code(403).send({ error: { message: "Forbidden" } });
  }
}

function extractCallerEmail(request: FastifyRequest): string | null {
  // Cloud Run IAM injects this header for authorized requests
  const userHeader = request.headers["x-goog-authenticated-user-email"] as string | undefined;
  if (userHeader) {
    // Format: "accounts.google.com:sa@project.iam.gserviceaccount.com"
    const colonIndex = userHeader.lastIndexOf(":");
    return colonIndex >= 0 ? userHeader.substring(colonIndex + 1) : userHeader;
  }
  
  // Fallback: decode X-Serverless-Authorization JWT
  const serverlessAuth = request.headers["x-serverless-authorization"] as string | undefined;
  if (serverlessAuth?.startsWith("Bearer ")) {
    const token = serverlessAuth.split(" ")[1];
    if (token) {
      const payload = jwt.decode(token) as Record<string, unknown> | null;
      return (payload?.email as string) || (payload?.sub as string) || null;
    }
  }
  
  return null;
}
```

**This preHandler is ONLY applied to `POST /identity`.**

### Testing

In tests, mock the header to simulate the Auth service's identity:

```typescript
// Integration test for POST /identity
const response = await app.inject({
  method: "POST",
  url: "/identity",
  headers: {
    "x-goog-authenticated-user-email": 
      "accounts.google.com:auth-service@project.iam.gserviceaccount.com",
  },
  body: { email: "test@example.com", first_name: "", last_name: "", identity_type: "person" },
});
```

---

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | `"local"` | Runtime environment |
| `LOG_LEVEL` | No | `"info"` | Pino log level |
| `PORT` | No | `8080` | Server port |
| `HOST` | No | `"0.0.0.0"` | Server host |
| `FIREBASE_PROJECT_ID` | Yes | — | GCP project ID |
| `FIREBASE_CLIENT_EMAIL` | Yes | — | Service account email for Firestore access |
| `SERVICE_ACCOUNT_PRIVATE_KEY` | Yes | — | Service account private key |
| `FIRESTORE_DATABASE_NAME` | No | `"identity"` | Firestore named database |
| `AUTH_SERVICE_ACCOUNT_EMAIL` | Yes | — | Auth service's Cloud Run service account email |

### Config Validation

On startup, the `config/index.ts` validates that required variables are present. If missing, the service should fail fast with a clear error message (not silently default to broken values).

```typescript
if (!config.firestore.projectId) {
  throw new Error("FIREBASE_PROJECT_ID is required");
}
if (!config.authServiceAccount) {
  throw new Error("AUTH_SERVICE_ACCOUNT_EMAIL is required");
}
```

---

## Error Handling

### Fastify Error Handler

Same pattern as Auth — single `setErrorHandler` in `app.ts`:

```typescript
app.setErrorHandler((error, request, reply) => {
  if (error.validation) {
    return reply.status(400).send({
      error: { message: error.message || "Validation error" },
    });
  }
  return reply.status(error.statusCode || 500).send({
    error: { message: error.message || "Internal server error" },
  });
});
```

### Error Message Table

Per requirements NFR3:

| Scenario | Status | Message |
|----------|--------|---------|
| Missing required fields | 400 | `"Missing required fields: email"` |
| Invalid identity_type | 400 | `"identity_type must be 'person'"` |
| Unknown fields in PATCH | 400 | `"Unknown fields: foo, bar"` |
| Invalid identity_id format | 400 | `"Invalid identity_id"` |
| Identity not found | 404 | `"Identity not found"` |
| Not authorized (no role) | 404 | `"Identity not found"` |
| Not owner | 403 | `"Only the owner can modify this identity"` |
| Non-Auth caller on POST | 403 | `"Forbidden"` |
| Unauthenticated | 401 | `"Unauthorized"` (preHandler, rarely reached — gateway blocks this) |

---

## Dependencies

### Production

| Package | Version | Purpose |
|---------|---------|---------|
| `fastify` | `^5.3.3` | HTTP framework |
| `@fastify/type-provider-typebox` | `^6.1.0` | TypeBox integration |
| `@fastify/swagger` | `^9.5.1` | OpenAPI generation |
| `@fastify/swagger-ui` | `^5.2.3` | Swagger UI |
| `@sinclair/typebox` | `^0.34.41` | Schema validation |
| `firebase-admin` | `^13.4.0` | Firestore access only (no auth functions used) |
| `jsonwebtoken` | `^9.0.2` | `jwt.decode()` for parsing JWT payloads without verification. Handles base64url encoding, malformed tokens, and edge cases. No crypto, no verify — parse only. Same library used by Auth service. |
| `pino` | (transitive via fastify) | Logging |

### Dev

| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | `^5.8.3` | TypeScript compiler |
| `vitest` | `^4.0.2` | Test runner |
| `supertest` | `^7.1.1` | HTTP integration tests |
| `@types/node` | `^24.9.1` | Node.js types |
| `@types/supertest` | `^6.0.3` | Supertest types |
| `@vitest/coverage-v8` | `^4.0.2` | Test coverage |
| `pino-pretty` | `^13.0.0` | Pretty logs for local dev |
| `ts-node-dev` | `^2.0.0` | Dev server with hot reload |

**Not included** (intentionally):
- `@fastify/cookie` — no cookie handling in Identity service
- `nodemailer` — no email in Identity service

---

## Dockerfile

Same multi-stage Alpine pattern as Auth:

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /usr/app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app

# Build args → env vars
ARG FIREBASE_PROJECT_ID
ARG FIREBASE_CLIENT_EMAIL
ARG NODE_ENV=production
ARG LOG_LEVEL=info
ARG PORT=8080
ARG HOST=0.0.0.0

ENV FIREBASE_PROJECT_ID=$FIREBASE_PROJECT_ID
ENV FIREBASE_CLIENT_EMAIL=$FIREBASE_CLIENT_EMAIL
ENV NODE_ENV=$NODE_ENV
ENV LOG_LEVEL=$LOG_LEVEL
ENV PORT=$PORT
ENV HOST=$HOST

# SERVICE_ACCOUNT_PRIVATE_KEY and AUTH_SERVICE_ACCOUNT_EMAIL
# are injected at runtime via Cloud Run env vars (secrets)

COPY --from=builder /usr/app/dist/. ./
COPY --from=builder /usr/app/node_modules ./node_modules
EXPOSE 8080
CMD ["node", "server.js"]
```

---

## Testing Strategy

### Unit Tests

Test services in isolation with Firestore mocked:

```typescript
// Mock firebase-admin/firestore
vi.mock("firebase-admin/firestore", () => ({
  getFirestore: vi.fn(() => mockFirestore),
}));
```

### Integration Tests

Test routes against `buildApp()` with `supertest`:

```typescript
import { buildApp } from "../src/app";

const app = buildApp();
await app.ready();

// Inject JWT-mock headers for domain auth tests
const response = await app.inject({
  method: "GET",
  url: "/identity/550e8400-e29b-41d4-a716-446655440000",
  headers: {
    authorization: `Bearer ${mockJwt}`,
  },
});
```

### Test Cases (Minimum)

| Test | What |
|------|------|
| `GET /health` | Returns 200 with correct shape |
| `POST /identity` (valid) | Creates identity, returns 201 with identity_id |
| `POST /identity` (no auth header) | Returns 403 |
| `POST /identity` (wrong caller) | Returns 403 |
| `POST /identity` (missing email) | Returns 400 |
| `POST /identity` (bad identity_type) | Returns 400 |
| `GET /identity/{id}` (authorized) | Returns 200 with IdentityRecord |
| `GET /identity/{id}` (no role) | Returns 404 |
| `GET /identity/{id}` (not found) | Returns 404 |
| `GET /identity/{id}` (invalid UUID) | Returns 400 |
| `GET /identity/{id}` (no JWT) | Returns 401 |
| `PATCH /identity/{id}` (owner) | Returns 200 with updated record |
| `PATCH /identity/{id}` (viewer, not owner) | Returns 403 |
| `PATCH /identity/{id}` (unknown fields) | Returns 400 |
| `PATCH /identity/{id}` (empty body) | Returns 400 (minProperties: 1) |

### Mock Design

Firestore mock uses `Map<string, IdentityRecord>` for in-memory storage. On exhaustion (e.g., `.get()` called when no document queued), throw an explicit error — never silently return `null` or `undefined`. Per master AGENTS.md P19.

---

## Deviation from Auth Service

| Aspect | Auth | Identity | Reason |
|--------|------|----------|--------|
| Cookies | `@fastify/cookie` for refresh token | None | Identity doesn't issue tokens |
| Firebase usage | `firebase-admin` auth functions | `firebase-admin` Firestore only | Identity is a domain store, not auth |
| Auth middleware | `jwt.decode()` for email extraction | `jwt.decode()` + `identities` claim check | Same library, same function — parse without verify. Identity trusts the gateway's JWT validation (documented risk — see § Security above). |
| Response wrapper | `{ data: { ... } }` for all endpoints | `{ data: { ... } }` for all endpoints | Consistent across project ecosystem (Auth, Projects, Identity) |
| Firestore init location | `services/firebase.ts` | `services/firestore.ts` | Same pattern (service init in services/ dir) |
| Type safety | n/a | FastifyRequest augmentation for `callerRoles` | Avoids `(request as any)` anti-pattern, proper TypeScript typing |
| Route prefix | `/auth` | `/identity` | Different domains |
| Service account | Auth's own SA | Dedicated SA (least privilege) | P3: domain-driven boundaries extend to IAM |
