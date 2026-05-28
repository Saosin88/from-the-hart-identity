# From The Hart Identity — Domain Glossary

> Canonical terms specific to the identity service. Extends [master CONTEXT.md](../CONTEXT.md).
> Code conventions: [AGENTS.md](./AGENTS.md).

---

## Identity

The central domain entity of this service. An **Identity** is a profile record with no credentials — those live on the **Principal** in the Auth service. Stored in Firestore (named database `"identity"`), keyed by `identity_id` (UUID).

- _Avoid:_ "user record", "profile document" (these are implementation details)
- _Relationships:_ An **Identity** is created by the **Auth** service during **Registration**.
  An **Identity** is linked to a **Principal** by shared email and the `identities` custom claim on the Principal's token record.
  An **Identity** is owned by exactly one **Principal** (the `owner` role).

### Identity Record

A Firestore document in the `identities` collection. Contains:

| Field | Type | Description |
|-------|------|-------------|
| `identity_id` | `string` (UUID) | Primary key, assigned at creation |
| `email` | `string` | Matches the Principal's email at creation time; read-only after creation |
| `first_name` | `string` | Mutable via PATCH |
| `last_name` | `string` | Mutable via PATCH |
| `identity_type` | `"person"` | Only `"person"` for initial release |
| `created_at` | `string` (ISO 8601) | Server-assigned timestamp |
| `updated_at` | `string` (ISO 8601) | Updated on every mutation |

- _Avoid:_ "user document", "profile record"
- _Relationships:_ Each **Identity Record** maps 1:1 to an **Identity**.

---

## Authorization

### Domain Authorization Check

The single authorization invariant in this service: a caller can only read or modify an **Identity** they have a role on. Enforced by parsing the end-user's JWT payload via `jwt.decode()` (from the `Authorization: Bearer` header, forwarded by the **API Gateway**) and reading the `identities` claim.

- For `GET /identity/{id}`: the requested `identity_id` must be in the caller's `identities` map.
- For `PATCH /identity/{id}`: the caller must have the `"owner"` role on the requested identity.

No cryptographic verification — the **API Gateway** already validated the JWT, and Cloud Run IAM authenticated the caller. No `firebase-admin` auth functions, no JWKS fetching. Zero dependencies added for auth.

- _Avoid:_ "auth middleware" (this is a domain check, not general middleware)
- _Relationships:_ Applied as a Fastify `preHandler` hook on protected routes.

---

## Persistence

## Endpoints

### `/identity/health`

Health check endpoint. Returns service status, uptime in seconds (`process.uptime()`), and current timestamp in ms (`Date.now()`). No authentication required. Pattern matches Auth service's `/auth/health`.

- _Avoid:_ N/A (no ambiguous terms)
- _Relationships:_ Called by Cloud Run startup probe and load balancer health checks.

---

## Persistence

### Firestore Named Database

The **Identity** service uses a Firestore named database called `"identity"` in the same GCP project as **Auth**. Named databases provide billing isolation and data separation from **Auth**'s `"auth"` database. No free quota on named databases, but at this scale the cost is negligible.

- _Avoid:_ "the database", "Firestore" (be specific — this is the identity database)
- _Relationships:_ One Firestore named database per environment (dev/prod).
  Accessed via `firebase-admin` SDK with a dedicated service account (separate from Auth's service account for least-privilege).
