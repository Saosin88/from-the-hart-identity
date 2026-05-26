# Identity Service Phase 1 — Tasks

> **Requirements:** [requirements.md](./requirements.md)
> **Design:** [design.md](./design.md)
> **Convention:** Tasks grouped into 4 phases. `[P]` = parallelizable. Each task has `VERIFY`, `FILES`, and `EDGE CASES`.

---

## Phase 1: Setup

### Task 1: Project Scaffolding `[SETUP]`

**FILES:** `package.json`, `tsconfig.json`, `Dockerfile`, `.gitignore`

Create the project skeleton matching `from-the-hart-auth` conventions.

**VERIFY:** `npm install` succeeds. `npm run build` compiles empty `src/server.ts` without errors.

**EDGE CASES:** `.env` accidentally committed (`.gitignore` must include it). Missing `"type": "module"` in package.json would break CommonJS imports.

---

## Phase 2: Foundational Infrastructure

### Task 2: Config Module `[P]`

**FILES:** `src/config/index.ts`, `src/config/logger.ts`, `src/config/swagger.ts`

Config loading, logging, and OpenAPI setup per design § Configuration.

**VERIFY:**
- `config.authServiceAccount` is a non-empty string when env var is set
- Missing required env vars (FIREBASE_PROJECT_ID, etc.) cause fail-fast error on import
- Swagger registers at `/identity/documentation` in a Fastify instance

**EDGE CASES:** `SERVICE_ACCOUNT_PRIVATE_KEY` with literal `\n` (must use `replace(/\\n/g, "\n")` like Auth does).

### Task 3: TypeBox Schemas `[P]`

**FILES:** `src/models/IdentitySchemas.ts`

All domain schemas — `IdentityRecordSchema`, `CreateIdentityRequestSchema`, `CreateIdentityResponseSchema`, `UpdateIdentityRequestSchema`, `HealthCheckResponseSchema`, `ErrorResponseSchema`.

**VERIFY:**
- `Value.Check(CreateIdentityRequestSchema, { email: "x@y.com", first_name: "", last_name: "", identity_type: "person" })` → true
- `Value.Check(CreateIdentityRequestSchema, { identity_type: "org" })` → false
- `Value.Check(UpdateIdentityRequestSchema, {})` → false (minProperties: 1)
- `Value.Check(UpdateIdentityRequestSchema, { foo: "bar" })` → false (additionalProperties: false)
- `CreateIdentityResponseSchema` has shape `{ identity_id: string (uuid) }`

**EDGE CASES:** TypeBox `additionalProperties: false` may need explicit handling if TypeBox version doesn't support it natively — validate in controller as fallback.

### Task 4: Firestore Service `[P]`

**FILES:** `src/services/firestore.ts`

Firebase Admin init — Firestore only, named database `"identity"`.

**VERIFY:**
- `initializeFirestore()` returns a Firestore instance
- Calling twice is idempotent (`getApps().length === 1`)
- Named database `"identity"` is used (verify via `databaseId` setting)

**EDGE CASES:** Invalid/expired `SERVICE_ACCOUNT_PRIVATE_KEY` → clear error message, not a cryptic Firebase error. No `GOOGLE_APPLICATION_CREDENTIALS` env var set locally → clear error.

### Task 5: Identity Service (Business Logic)

**FILES:** `src/services/identityService.ts`

Pure CRUD — `createIdentity()`, `getIdentity()`, `updateIdentity()`. The latter uses a Firestore transaction for atomicity.

**VERIFY:**
- `createIdentity(validData)` → `{ identity_id: uuid }`, document exists in mock Firestore
- `getIdentity(uuid)` → `IdentityRecord`
- `getIdentity(bogusUuid)` → `null`
- `updateIdentity(uuid, { first_name: "New" })` → updated record with bumped `updated_at`
- `updateIdentity(bogusUuid, ...)` → `null`
- Firestore error (simulated) → logged and re-thrown as 500

**EDGE CASES:** Concurrent PATCHes on same Identity — transaction ensures last writer doesn't overwrite silently. Firestore timeout → 500 logged. Empty strings for first_name/last_name are valid (PATCH with `{ first_name: "" }` clears the field).

### Task 6: Domain Authorization PreHandler `[P]`

**FILES:** `src/preHandlers/domainAuth.ts`

JWT payload parsing via `jwt.decode()` (from `jsonwebtoken`) — no crypto verification. Fastify preHandler for GET/PATCH. Includes type augmentation for `FastifyRequest.callerRoles`.

**VERIFY:**
- Valid JWT with matching identity_id in `identities` → passes, `request.callerRoles` set
- Valid JWT with non-matching identity_id → 404 "Identity not found"
- No Authorization header → 401 "Unauthorized"
- Malformed token (non-3-segment, non-JSON) → 401 (handled by `jwt.decode()` returning null)
- JWT without `identities` claim → 401

**EDGE CASES:** JWT with `identities` as non-object (array, string, null) → 401. Token with empty `identities` map (`{}`) → 404 (requested identity not in empty map). `jwt.decode()` correctly handles base64url encoding (RFC 4648 §5) — the previous manual `Buffer.from(x, 'base64')` approach silently corrupted `-` and `_` characters.

### Task 7: Auth Service Caller Verification PreHandler `[P]`

**FILES:** `src/preHandlers/authServiceCaller.ts`

Verify POST /identity caller is the Auth service. Checks `X-Goog-Authenticated-User-Email` header against `config.authServiceAccount`.

**VERIFY:**
- Header matches `config.authServiceAccount` → passes
- Header doesn't match → 403 "Forbidden"
- No header present → 403
- Header present but with `accounts.google.com:` prefix → correctly stripped before comparison

**EDGE CASES:** `X-Serverless-Authorization` fallback path (uses `jwt.decode()` for email/sub claim extraction — same parsing library). Malformed serverless auth token → 403 (not 500 — don't crash on bad auth data).

**Checkpoint:** After Phase 2, all infrastructure code compiles and Firestore mock works. No server yet.

---

## Phase 3: User-Facing Endpoints

### Task 8: Controllers

**FILES:** `src/controllers/identityController.ts`

Thin handlers — `checkHealth`, `createIdentity`, `getIdentity`, `updateIdentity`.

**VERIFY:**
- Health → 200 `{ data: { status: "ok", uptime: number, timestamp: ISO-string } }`
- Create (valid, with auth header) → 201 `{ data: { identity_id: string } }`
- Get (authorized) → 200 `{ data: IdentityRecord }` + `Cache-Control: public, max-age=300`
- Get (not found in Firestore) → 404
- Update (owner) → 200 `{ data: IdentityRecord }` + `Cache-Control: no-cache`
- Update (viewer, not owner) → 403 "Only the owner can modify this identity"

**EDGE CASES:** `request.callerRoles` is `undefined` when preHandler didn't run (e.g., bug in route config) → 401. `request.callerRoles` is empty array → not owner (403 on PATCH).

### Task 9: Routes

**FILES:** `src/routes/identity.ts`

Route definitions with inline OpenAPI schemas, following Auth's pattern exactly.

**VERIFY:**
- `GET /health` registered (no auth, no preHandler)
- `POST /identity` registered (preHandler: verifyAuthServiceCaller)
- `GET /identity/:identity_id` registered (preHandler: domainAuth, params schema validates UUID)
- `PATCH /identity/:identity_id` registered (preHandler: domainAuth)
- Swagger UI at `/identity/documentation` shows all 4 routes with examples

**EDGE CASES:** Invalid UUID for `:identity_id` param → 400 from TypeBox validation (never reaches controller). Route prefix clash with another plugin.

### Task 10: App Assembly

**FILES:** `src/app.ts`, `src/server.ts`

`buildApp()` factory + local dev entry point.

**VERIFY:**
- `npm run dev` starts without errors
- `curl localhost:8080/health` → 200 with `{ data: { status: "ok", ... } }`
- `curl localhost:8080/identity/documentation` → Swagger UI HTML
- `NODE_ENV=test` skips Firestore initialization (examining `buildApp()` behavior in test mode)

**EDGE CASES:** Firestore init failure in non-test mode → clear error, `process.exit(1)`. Port already in use → Fastify error.

**Checkpoint:** After Phase 3, all 4 endpoints respond correctly. `npm run dev` → Swagger UI loads → health check works.

---

## Phase 4: Testing & Infrastructure

### Task 11: Unit & Integration Tests

**FILES:** `tests/health.test.ts`, `tests/identity-create.test.ts`, `tests/identity-get.test.ts`, `tests/identity-update.test.ts`, `tests/domainAuth.test.ts`

Comprehensive test suite. Test cases identical to those listed in design § Testing Strategy.

**Mock strategy:**
- Firestore: in-memory `Map<string, IdentityRecord>`
- JWT payloads: hand-crafted base64-encoded objects
- Cloud Run IAM header: injected via `app.inject({ headers: {...} })`
- Mocks fail loudly on exhaustion (throw Error, never silent default) — per P19

**Test list (15 minimum):**

| # | Test | Expected |
|---|------|----------|
| 1 | GET /health | 200 `{ data: { status: "ok", uptime, timestamp } }` |
| 2 | POST /identity (valid, Auth caller) | 201 `{ data: { identity_id } }` |
| 3 | POST /identity (no auth header) | 403 |
| 4 | POST /identity (wrong caller) | 403 |
| 5 | POST /identity (missing email) | 400 |
| 6 | POST /identity (bad identity_type) | 400 |
| 7 | GET /identity/{id} (authorized) | 200 `{ data: IdentityRecord }` + Cache-Control |
| 8 | GET /identity/{id} (no role) | 404 |
| 9 | GET /identity/{id} (not found in DB) | 404 |
| 10 | GET /identity/{id} (invalid UUID) | 400 |
| 11 | GET /identity/{id} (no JWT) | 401 |
| 12 | PATCH /identity/{id} (owner) | 200 `{ data: updated }` + no-cache |
| 13 | PATCH /identity/{id} (viewer, not owner) | 403 |
| 14 | PATCH /identity/{id} (unknown fields) | 400 |
| 15 | PATCH /identity/{id} (empty body) | 400 |

**VERIFY:**
- `npm test` → all 15 tests pass
- `npm run test:coverage` → >80% line coverage
- Mock Firestore is isolated per test (no cross-test contamination)

**EDGE CASES:** Test that mocks throw on exhaustion (write a test that expects more mock calls than provided → test fails with clear error, not a silent pass).

### Task 12: Terraform `[P]`

**FILES:** `terraform/modules/`, `terraform/dev/`, `terraform/prod/`

Infrastructure as Code — Cloud Run service, Firestore named database, IAM bindings.

**Resources:**
- `google_firestore_database` — named `"identity"`, Firestore Native mode
- `google_service_account` — dedicated Identity SA
- `google_project_iam_member` — `roles/datastore.user` for Identity SA
- `google_cloud_run_v2_service` — Identity container from Artifact Registry
- `google_cloud_run_service_iam_binding` — `roles/run.invoker` to Auth SA + Gateway SA

**VERIFY:**
- `terraform plan` in `dev/` shows correct resources
- `terraform plan` in `prod/` shows correct resources
- IAM bindings reference correct service account emails
- Env vars in Cloud Run service match design § Configuration

**EDGE CASES:** Terraform state not initialized (S3 backend). Service account email mismatch between env and Terraform. Firestore database already exists (import vs create).

---

## Execution Order

```
Phase 1: Task 1 (Scaffolding)
    ↓
Phase 2: Tasks 2, 3, 4, 6, 7   ← [P] run in parallel
    ↓         ↓
Phase 2: Task 5 (depends on 4)
    ↓
Phase 3: Task 8 (depends on 5, 6, 7)
    ↓
Phase 3: Task 9 (depends on 3, 8)
    ↓
Phase 3: Task 10 (depends on 2, 4, 9)
    ↓
Phase 4: Task 11 (depends on 10)
    ↓
Phase 4: Task 12 (depends on 4)  ← [P] can run in parallel with 5-11
```

**Parallelizable note:** Tasks 2, 3, 4, 6, 7 are all independent of each other (all depend only on Task 1). Task 12 can start as soon as the Firestore service is designed (Task 4). Task 11 can be written alongside Tasks 8-10 using TDD.

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 — Setup | 1 | Project scaffolding |
| 2 — Foundational | 2-7 | Config, schemas, services, preHandlers |
| 3 — Endpoints | 8-10 | Controllers, routes, app assembly |
| 4 — Polish | 11-12 | Tests, Terraform |
