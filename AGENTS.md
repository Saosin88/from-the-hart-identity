# From The Hart Identity

> **Hierarchy:** Service-specific rules for identity. Extends [master AGENTS.md](../AGENTS.md).
> Rules here take precedence over both master and personal AGENTS.md.
> **Stack:** TypeScript + Fastify + GCP Cloud Run. Rust/Vue/Terraform sections of master AGENTS.md apply to other services.
>
> Identity domain store — pure profile data with no credentials or authN/authZ concerns.
> Architecture: [Identity & Access Architecture](../docs/architecture/identity-and-access.md)
> Domain glossary: [CONTEXT.md](./CONTEXT.md)
> Active spec: [specs/identity-service-phase-1/](specs/identity-service-phase-1/)

---

## What This Service Is

A **pure domain store** for Identity profile data. It knows nothing about authentication, authorization, or token issuance — those live in the Auth service. It enforces exactly one domain invariant: a caller can only read or modify an Identity they have a role on (checked via the JWT `identities` custom claim, forwarded by the API Gateway).

Two consumers:
- **Auth service** — calls `POST /identity` directly (not through the gateway) during registration. Verified by Cloud Run IAM service account.
- **API Gateway** — routes external `/identity/*` requests from the Website. Forwards the end-user's JWT.

---

## Tech Stack

- **Framework:** Fastify v5 with `@fastify/type-provider-typebox`
- **Persistence:** Firestore named database `"identity"` (separate from Auth's `"auth"` database)
- **Validation:** TypeBox schemas — runtime validation AND auto-generated OpenAPI docs
- **Auth (inbound):** Cloud Run IAM (POST /identity). JWT payload parsing via `jwt.decode()` from `jsonwebtoken` (parse without crypto verification — gateway already validated). No `firebase-admin` auth functions, no JWKS fetching.
- **Deploy:** GCP Cloud Run (Docker) + Artifact Registry
- **Testing:** Vitest + supertest. Firestore mocked as in-memory `Map`. Mocks must fail loudly on exhaustion — never silent defaults.
- **API Docs:** `@fastify/swagger` + `@fastify/swagger-ui` at `/identity/documentation`

### Dependencies NOT in This Service

`firebase-admin` and `jsonwebtoken` are both direct dependencies. What's excluded:

| What | Why Not |
|------|---------|
| `firebase-admin` auth functions (`adminAuth()`, `verifyIdToken()`, `createCustomToken()`, `setCustomUserClaims()`) | Auth lives in the Auth service. Identity only uses `firebase-admin` for Firestore (`getFirestore()`). |
| `jwt.verify()` | No crypto verification. `jwt.decode()` only — parse the payload, trust the gateway's validation. |
| `@fastify/cookie` | No cookie handling. No token issuance or refresh. |
| `nodemailer` | No email — that's Auth's responsibility. |

---

## Common Commands

```bash
npm install              # Install deps
npm run dev              # Dev server with hot reload (ts-node-dev)
npm run build            # Compile TypeScript
npm start                # Run compiled output
npm test                 # Run all tests
npm run test:coverage    # Test with coverage
```

---

## Directory Structure

```
src/
├── config/
│   ├── index.ts          # Env var loading → typed config (fail-fast on missing)
│   ├── logger.ts         # Pino logger (pino-pretty for local, JSON for prod)
│   └── swagger.ts        # OpenAPI at /identity/documentation
├── controllers/
│   └── identityController.ts  # Thin handlers — validate, call service, format { data }/{ error }
├── models/
│   └── IdentitySchemas.ts     # TypeBox schemas for all request/response shapes
├── routes/
│   └── identity.ts            # Route definitions with full inline OpenAPI schemas
├── services/
│   ├── identityService.ts     # Business logic — CRUD with Firestore transactions
│   └── firestore.ts           # Firebase Admin init (Firestore only, named DB "identity")
├── preHandlers/
│   ├── domainAuth.ts          # jwt.decode() to extract identities claim from JWT payload
│   └── authServiceCaller.ts   # Verify POST /identity caller is Auth service
├── app.ts                # buildApp() factory — no side effects
└── server.ts             # Local dev entry point
```

---

## Key Patterns

### `buildApp()` factory
Creates Fastify instance, registers plugins and routes, sets error handler. Returns the app — no port binding. Enables supertest testing. Same pattern as Auth and all other Fastify services. See master AGENTS.md "Code Patterns → Fastify Service."

### TypeBox everywhere
Schemas in `IdentitySchemas.ts` define BOTH runtime validation and OpenAPI doc generation. Route schemas are inline in `identity.ts` per Auth's pattern (inline `schema` objects with `body`, `response`, `examples`). Never hand-write OpenAPI YAML.

### Controllers are thin
Validate input → call service → format response. No business logic, no direct Firestore calls. All Firestore access goes through `identityService.ts`.

### Response shape (project-wide convention)
- **Success:** `{ data: { ... } }` — all endpoints, matching Auth and Projects
- **Error:** `{ error: { message: "..." } }` — all endpoints

### Domain authorization (not auth)
No `firebase-admin` auth functions. No JWKS fetching. No crypto verification.
- Import `jwt` from `jsonwebtoken` (direct dependency — same library used by Auth for `jwt.decode()`)
- Call `jwt.decode(token)` — parses without verification, correctly handles base64url encoding (RFC 4648 §5)
- Check `payload.identities[request.params.identity_id]` exists
- Attach roles to `request.callerRoles` (FastifyRequest augmentation — typed, not `(request as any)`)

### POST /identity caller verification
Only the Auth service may create Identities. Verify via Cloud Run IAM header:
- Check `X-Goog-Authenticated-User-Email` header (strip `accounts.google.com:` prefix)
- Compare against `config.authServiceAccount`
- Fallback: decode `X-Serverless-Authorization` JWT for email claim
- Mismatch or missing → 403 `{ error: { message: "Forbidden" } }`

### Firestore transactions
`updateIdentity()` uses a Firestore transaction for atomic read-write. Prevents lost updates on concurrent PATCHes. Firestore SDK handles automatic retry on contention — no custom retry logic needed in Phase 1.

### Security: No cryptographic JWT verification
The Identity service trusts the API Gateway's JWT validation. This is a documented design tradeoff — if the gateway is compromised, an attacker could forge `identities` claims. Accepted risk at this scale. See spec design § "Security: Trusting the Gateway's JWT Validation" for mitigations and revisit criteria.

### Caching
- `GET /identity/{id}` → `Cache-Control: public, max-age=300` (5 min edge cache)
- `PATCH /identity/{id}` → `Cache-Control: no-cache`
- Known limitation: after PATCH, stale data may be served for up to 5 min. Edge cache purge deferred to Phase 2.

---

## Error Codes

| Scenario | Status | Message |
|----------|--------|---------|
| Missing required fields | 400 | `"Missing required fields: email"` |
| Invalid identity_type | 400 | `"identity_type must be 'person'"` |
| Unknown fields in PATCH | 400 | `"Unknown fields: foo, bar"` |
| Invalid identity_id format | 400 | `"Invalid identity_id"` |
| Identity not found in Firestore | 404 | `"Identity not found"` |
| Caller has no role on Identity | 404 | `"Identity not found"` (don't reveal existence) |
| Caller has role but not owner on PATCH | 403 | `"Only the owner can modify this identity"` |
| Non-Auth caller on POST /identity | 403 | `"Forbidden"` |
| No JWT or malformed JWT | 401 | `"Unauthorized"` |

**Critical convention:** `404` for both "not found" AND "unauthorized to see." Never return 403 when the caller simply lacks a role — that reveals the Identity exists. This matches the spec: REQ-3.4.

---

## Boundaries

### ✅ Always
- Run `npm test` before considering work done
- Use TypeBox schemas for all route validation
- Return 404 (not 403) when caller has no role on an Identity
- Use `buildApp()` factory — never create Fastify instances directly in tests
- Mock Firestore as in-memory storage. Mocks must throw on exhaustion — never silently return defaults (P19)
- Follow the `{ data }` / `{ error }` response convention
- Reference the architecture doc and spec before making identity-domain decisions

### ⚠️ Ask first
- Adding dependencies (especially anything JWT/crypto/auth-related)
- Changing the Firestore document schema (affects Auth service's integration)
- Changing the JWT claim shape the service expects
- Adding new routes (new endpoints must be spec'd first — this is Phase 1 only)
- Changing error response codes or messages
- Touching `AUTH_SERVICE_ACCOUNT_EMAIL` configuration
- Adding any `firebase-admin` auth function (violates the "zero auth dependencies" constraint)

### 🚫 Never
- Commit `.env` files or service account keys
- Use `firebase-admin` auth functions: `adminAuth()`, `verifyIdToken()`, `createCustomToken()`, `setCustomUserClaims()`. Firestore only (`getFirestore()`).
- Use `jwt.verify()` — parse only (`jwt.decode()`). No crypto verification of any kind.
- Return 403 when the caller simply lacks a role (use 404 — don't reveal existence)
- Change the Firestore named database from `"identity"`
- Add business logic to controllers — all logic goes through `identityService.ts`
- Use `(request as any)` for type augmentation — use `declare module 'fastify'` instead
- Implement DELETE, switch-identity, or role management — these are Phase 2+
