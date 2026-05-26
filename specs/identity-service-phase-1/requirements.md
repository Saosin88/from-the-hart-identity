# Identity Service Phase 1 — Requirements

> **Source:** [Identity & Access Architecture](../../docs/architecture/identity-and-access.md)
> **Phase 1 scope** defined per architecture doc § "Phase 1 Scope" — all items listed there, nothing more.
> **Status:** Draft

---

## Assumptions

These preconditions must hold for Phase 1 to be implementable. If any assumption is violated, the spec must be revised before implementation.

| # | Assumption | Rationale |
|---|-----------|----------|
| A1 | The Auth service's JWT `identities` custom claim has the shape `Record<string, string[]>` (identity_id → role[]). This is the contract defined in the Identity & Access Architecture doc § "JWT Contract — Custom Claims". If Auth changes the claim shape, Identity must be updated synchronously. | Identity service reads this claim directly from the JWT payload. |
| A2 | The API Gateway forwards the end-user's `Authorization: Bearer <jwt>` header to the Identity service alongside its own `X-Serverless-Authorization` header. The gateway has already validated the JWT. | Identity service does not cryptographically verify the JWT — it trusts the gateway's validation. |
| A3 | Cloud Run IAM is configured to inject `X-Goog-Authenticated-User-Email` header for authorized service account calls. | POST /identity caller verification depends on this header. |
| A4 | The Auth service's Cloud Run service account email is known at deploy time and configured via `AUTH_SERVICE_ACCOUNT_EMAIL` env var. If the service account is rotated, this env var must be updated. | Used for POST /identity caller verification. |
| A5 | The Firestore named database `"identity"` exists in the same GCP project as Auth (created by Terraform — see Task 12). | Identity service needs it to persist documents. |
| A6 | Environment has access to Secret Manager for `SERVICE_ACCOUNT_PRIVATE_KEY` (injected at runtime). | Firebase Admin SDK requires service account credentials. |

---

## Key Entities

Domain objects referenced across this spec. See [Identity & Access Architecture](../../docs/architecture/identity-and-access.md) § "Domain Design" for full definitions.

| Entity | Definition | Where Defined |
|--------|-----------|--------------|
| **Identity** | A domain profile record stored in Firestore. Has `identity_id`, `email`, `first_name`, `last_name`, `identity_type`, `created_at`, `updated_at`. No credentials. | This service (Identity service) |
| **Principal** | The authenticated cryptographic entity (Firebase user). Has a Firebase UID, email, and password. May have roles on multiple Identities. | Auth service |
| **Role** | A string label (`owner`, `viewer`) granting authorizations over an Identity. Stored in the JWT `identities` claim as `identity_id → role[]`. | Auth service (JWT custom claims) |
| **Acting Identity** | The specific Identity a Principal is operating as. Carried as `acting_identity` in the JWT. | Auth service (JWT custom claims) |
| **JWT `identities` claim** | A `Record<string, string[]>` mapping `identity_id` to an array of role strings. Example: `{ "abc-123": ["owner"], "def-456": ["viewer"] }` | Auth service (JWT custom claims) |

---

## Success Criteria

Phase 1 is successful when:

| # | Criterion | Measurement |
|---|-----------|-------------|
| SC1 | Auth service can create an Identity via `POST /identity` | Integration test passes; <500ms P95 latency |
| SC2 | Authorized callers can read their own Identity via `GET /identity/{id}` | Integration test passes; <200ms P95 latency |
| SC3 | Unauthorized callers receive 404 (not 403) when requesting an Identity they have no role on | Test: caller with no role → 404 |
| SC4 | Only callers with the `owner` role can update an Identity | Test: viewer role → 403, owner role → 200 |
| SC5 | Only the Auth service can create Identities via `POST /identity` | Test: non-Auth caller → 403 |
| SC6 | All 15 defined test cases pass | `npm test` exits 0 |
| SC7 | Service starts locally and serves `/health` | `curl localhost:8080/health` returns 200 |
| SC8 | OpenAPI docs are accessible at `/identity/documentation` | Browser visit shows Swagger UI |

---

## Overview

Build the **Identity service** (`from-the-hart-identity`) — a Fastify/TypeScript service deployed on Cloud Run, backed by a Firestore named database `"identity"`. It's a pure domain store for Identity profile data with no authentication/authorization concerns (those live in the Auth service). The service enforces a single domain invariant: callers can only read or modify Identities they have a role on (checked via the JWT `identities` custom claim).

Two consumers:
- **Auth service** — calls `POST /identity` directly (not through the API Gateway) during registration orchestration, authenticated via Google ID token (Cloud Run IAM).
- **API Gateway** — routes external `/identity/*` requests from the Website, forwarding the end-user's JWT plus its own Google ID token.

---

## Functional Requirements

### REQ-1: Health Endpoint

**REQ-1.1** `GET /health` returns `{ data: { status: "ok", uptime, timestamp } }` where `uptime` is a number (seconds, from `process.uptime()`) and `timestamp` is an ISO 8601 string (e.g., `"2026-05-24T12:00:00.000Z"`).
**REQ-1.2** No authentication required.

---

### REQ-2: Create Identity (`POST /identity`)

**REQ-2.1** Called by the **Auth service** directly (not through the API Gateway).
**REQ-2.2** Request body:

```json
{
  "email": "sheldon@example.com",
  "first_name": "",
  "last_name": "",
  "identity_type": "person"
}
```

**REQ-2.3** Given a valid request, the service generates a UUID `identity_id` server-side and returns 201 with:
```json
{ "data": { "identity_id": "550e8400-e29b-41d4-a716-446655440000" } }
```
**REQ-2.4** Sets `created_at` and `updated_at` to current ISO 8601 timestamp.
**REQ-2.5** Validates:
- `email` is required and a non-empty string.
- `identity_type` must be `"person"` (only supported value).
- `first_name` and `last_name` are strings (may be empty).
- Given invalid input, the response is 400 with `{ error: { message: "..." } }`.
**REQ-2.6** Stores the Identity document in Firestore named database `"identity"`, in the `identities` collection, keyed by `identity_id`.

**REQ-2.7** Given a request with `X-Goog-Authenticated-User-Email` header set to an email that does NOT match `AUTH_SERVICE_ACCOUNT_EMAIL`, the service returns 403 `{ error: { message: "Forbidden" } }`.
**REQ-2.8** Given a request with no `X-Goog-Authenticated-User-Email` or `X-Serverless-Authorization` header, the service returns 403.

---

### REQ-3: Get Identity (`GET /identity/{identity_id}`)

**REQ-3.1** Called via the API Gateway (external traffic from the Website).
**REQ-3.2** Requires authentication — caller must have a role on the requested Identity.
**REQ-3.3** Authentication check: base64-decode the end-user's JWT from the `Authorization: Bearer` header, extract the `identities` claim (map of `identity_id → role[]`). Verify `identity_id` is a key in this map.
**REQ-3.4** Given a caller with no role on the Identity, the service returns 404 `{ error: { message: "Identity not found" } }` (must not reveal existence).
**REQ-3.5** Given the Identity doesn't exist in Firestore, the service returns 404.
**REQ-3.6** Given a valid request with the caller having a role on the Identity, return 200 with:
```json
{
  "data": {
    "identity_id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "sheldon@example.com",
    "first_name": "Sheldon",
    "last_name": "Hart",
    "identity_type": "person",
    "created_at": "2026-05-24T12:00:00.000Z",
    "updated_at": "2026-05-24T12:00:00.000Z"
  }
}
```
**REQ-3.7** Set `Cache-Control: public, max-age=300` on the response (5-minute edge cache).

**Known limitation:** After a PATCH update, the edge cache may serve stale data for up to 5 minutes. Edge cache purge is deferred to Phase 2.

---

### REQ-4: Update Identity (`PATCH /identity/{identity_id}`)

**REQ-4.1** Called via the API Gateway (external traffic from the Website).
**REQ-4.2** Requires `owner` role on the requested Identity.
**REQ-4.3** Authentication check: same JWT decode as REQ-3. Given a caller has a role but is NOT `owner`, the service returns 403 `{ error: { message: "Only the owner can modify this identity" } }`.
**REQ-4.4** Given the Identity doesn't exist, return 404.
**REQ-4.5** Only `first_name` and `last_name` are mutable. All other fields (`identity_id`, `email`, `identity_type`, `created_at`) are read-only after creation.
**REQ-4.6** Given a valid PATCH request with at least one allowed field, the service returns 200 with `{ data: <full updated IdentityRecord> }`.
**REQ-4.7** Given a PATCH request with unknown fields (e.g., `{ "foo": "bar" }`), the service returns 400 `{ error: { message: "Unknown fields: foo" } }`.
**REQ-4.8** Updates `updated_at` to current ISO 8601 timestamp on every mutation.
**REQ-4.9** Sets `Cache-Control: no-cache` to prevent stale edge cache.

---

### REQ-5: Input Validation

**REQ-5.1** All request bodies validated via TypeBox schemas — runtime validation AND auto-generated OpenAPI docs.
**REQ-5.2** Given validation fails, the service returns 400 with `{ error: { message: "..." } }`.
**REQ-5.3** Common validation cases covered:
- Missing required fields (`email` on POST)
- Invalid `identity_type` (not `"person"`)
- Invalid `identity_id` format (not a UUID) on GET/PATCH
- Unknown fields in PATCH body

---

### REQ-6: Domain Authorization

**REQ-6.1** No cryptographic JWT verification — the API Gateway already validated the end-user's ID token and Cloud Run IAM authenticated the caller. The Identity service only reads the JWT payload for the `identities` claim.
**REQ-6.2** JWT payload accessed via `jwt.decode()` from the `jsonwebtoken` library (direct dependency — same library used by Auth service). `jwt.decode()` parses without crypto verification — it correctly handles base64url encoding (RFC 4648 §5), malformed tokens, and missing claims. No `firebase-admin` auth functions, no JWKS fetching, no token signature verification.
**REQ-6.3** Authorization check applied as a Fastify `preHandler` hook on `GET /identity/{id}` and `PATCH /identity/{id}`.
**REQ-6.4** `POST /identity` has no domain authorization — it uses caller verification (REQ-2.7/2.8) instead.

---

### REQ-7: Persistence

**REQ-7.1** Firestore named database `"identity"` in the same GCP project as Auth.
**REQ-7.2** Dedicated service account for the Identity service (separate from Auth's — least privilege).
**REQ-7.3** `firebase-admin` SDK for Firestore access (the Identity service does NOT use any auth functions — only Firestore).

---

### REQ-8: OpenAPI Documentation

**REQ-8.1** Auto-generated OpenAPI docs via `@fastify/swagger` + `@fastify/swagger-ui` from route TypeBox schemas.
**REQ-8.2** Every route must have `description`, `summary`, `response` schemas, and `examples`.
**REQ-8.3** Accessible at `/identity/documentation` — follows the same pattern as the Auth service (`/auth/documentation`).

---

## Non-Functional Requirements

### NFR1: Language & Framework

- TypeScript with Node.js 22 (latest LTS)
- Fastify v5 with `@fastify/type-provider-typebox`
- Docker container for Cloud Run deployment

### NFR2: Testing

- Vitest for unit tests
- `buildApp()` factory pattern — app is a factory function, not a module-level singleton. Enables testing without port binding.
- Integration tests via `supertest` against `buildApp()`
- Health endpoint tested (minimum smoke test)
- At least one happy-path test per endpoint
- Mocks must fail loudly on exhaustion (don't silently return defaults)

### NFR3: Error Handling

All error responses follow the existing convention: `{ error: { message: "..." } }`

| Scenario | Status | Message |
|----------|--------|---------|
| Missing required fields | 400 | `"Missing required fields: email"` |
| Invalid identity_type | 400 | `"identity_type must be 'person'"` |
| Unknown fields in PATCH | 400 | `"Unknown fields: foo, bar"` |
| Invalid identity_id format | 400 | `"Invalid identity_id"` |
| Identity not found | 404 | `"Identity not found"` |
| Not authorized (no role) | 404 | `"Identity not found"` (same as not found — don't reveal existence) |
| Not owner (has role, not owner) | 403 | `"Only the owner can modify this identity"` |
| Unauthenticated | 401 | Handled by gateway, never reaches service |

### NFR4: Observability

- Structured JSON logging
- `/health` endpoint (REQ-1)
- Auto-generated OpenAPI docs (REQ-8)

### NFR5: Caching

- `GET /identity/{id}` → `Cache-Control: public, max-age=300` (5 min)
- `PATCH /identity/{id}` → `Cache-Control: no-cache`
- `POST /identity` → no cache headers (internal endpoint)
- Future: PATCH may purge Cloudflare cache for the GET URL

### NFR6: Architecture Principles Compliance

From the [master AGENTS.md](../../AGENTS.md#principles):

| Principle | Compliance |
|-----------|------------|
| P1 (Serverless-first) | ✅ Cloud Run |
| P2 (Multi-cloud portability) | ✅ Docker container, adapter pattern |
| P3 (Domain-driven boundaries) | ✅ Identity owns only profile data; no auth concerns |
| P5 (Zero-trust) | ✅ Cloud Run IAM enforces service-to-service auth |
| P7 (IaC) | ✅ Terraform for Cloud Run, Firestore, IAM |
| P11 (Observability) | ✅ Structured logging, /health, OpenAPI |
| P13 (Prefer open-source) | ✅ All open-source stack |
| P14 (Cost-conscious) | ✅ Cloud Run scales to zero; Firestore pay-per-use |
| P15 (Latest stable) | ✅ Node 22, Fastify 5 |
| P16 (Language-idiomatic) | ✅ Strict TS, TypeBox validation |
| P18 (DI over globals) | ✅ `buildApp()` factory, no global state |

### NFR7: Performance

- P95 response time < 200ms for GET/PATCH (single Firestore read/write)
- P95 response time < 500ms for POST (Firestore write)
- Cold start: acceptable given Cloud Run scale-to-zero model

---

## Out of Scope (Deferred)

Explicitly NOT in this spec per architecture doc § "Phase 1 Scope — Deferred":

- **DELETE /identity** — Deferred. Identity deletion has cross-domain implications (Storage files, Projects).
- **Switch-identity endpoint** — Deferred. `POST /auth/switch-identity` in the Auth service.
- **Role management (grant/revoke)** — Deferred. `POST /auth/identities/{id}/roles`.
- **Multiple identities per Principal** — Deferred. Current registration creates exactly 1:1.
- **Email change** — Not supported. The email field is read-only after creation.
- **Ownership transfer** — Deferred.
- **Identity types beyond `"person"`** — Deferred (`"organization"`, `"service"`).
- **Cloudflare cache purge on PATCH** — Deferred. Edge cache naturally expires after 5 minutes.

---

## Constraints & References

- **Architecture doc:** `docs/architecture/identity-and-access.md` — canonical authority for all identity/access design decisions
- **Master AGENTS.md:** Principles P1-P20
- **Master CONTEXT.md:** Cross-domain glossary (Principal, Identity, Acting Identity, Role, Owner)
- **Project CONTEXT.md:** Domain-specific glossary (Identity Record, Domain Authorization Check, Firestore Named Database)
- **Auth service:** `from-the-hart-auth` — calls `POST /identity` during registration. Auth's service account is the only caller authorized for Identity creation.
- **API Gateway:** `from-the-hart-tech-api-reverse-proxy-worker` — routes external `/identity/*` requests to this service.
- **Terraform:** This project's `terraform/` directory manages Cloud Run, Firestore, and IAM bindings granting `roles/run.invoker` to Auth's service account and the gateway's service account.
