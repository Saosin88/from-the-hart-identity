# From The Hart Identity API

A Fastify-based identity domain store for From The Hart services. This API provides Identity profile management — a pure domain store with no authentication or authorization logic, backed by Firestore and deployed as a containerized service on Google Cloud Run.

![Status](https://img.shields.io/badge/Phase_1-Complete-success)
![Platform](https://img.shields.io/badge/Platform-Google_Cloud_Run-blue)
![Framework](https://img.shields.io/badge/Framework-Fastify-green)

## 🔍 Overview

The From The Hart Identity API is part of a multi-cloud architecture that spans AWS, GCP, and Cloudflare. It is a **pure domain store** for Identity profile data, enforcing a single domain invariant: a caller can only read or modify an Identity they have a role on.

This service does NOT handle authentication, authorization, or token issuance — those live in the Auth service. It has two consumers:

- **Auth service** — calls `POST /identity` directly (not through the API Gateway) during registration
- **API Gateway** — routes external `/identity/*` requests from the Website

## 🛠️ Tech Stack

- **Framework**: Fastify with TypeScript
- **Persistence**: Firestore named database `"identity"`
- **Validation**: TypeBox schemas (runtime validation + auto-generated OpenAPI docs)
- **Testing**: Vitest for unit and integration tests
- **Containerization**: Docker for deployments
- **Cloud Platform**: Google Cloud Run
- **Infrastructure**: Terraform (managed in the `from-the-hart-infrastructure` repository)

## 📋 Prerequisites

- Node.js (v22 or higher)
- npm

**For local dev (mock mode):** just the above. Run `npm run dev:mock` — zero GCP credentials needed.
**For local dev (real Firestore):** Google Cloud SDK with ADC (`gcloud auth application-default login --impersonate-service-account identity-sa@...`).
**For deployment:** Docker + GCP project with Firestore enabled.

## 🚀 Getting Started

### Installation

```bash
cd from-the-hart-identity
npm install
```

### Local Development

Two modes for local dev:

**Mock mode (recommended — no GCP credentials needed):**

```bash
npm run dev:mock
```

Uses an in-memory Firestore. No `.env` needed, no ADC, no impersonation. All endpoints work — data is lost on restart.

**Real mode (requires ADC):**

```bash
# Set up Application Default Credentials by impersonating the identity service account
gcloud auth application-default login --impersonate-service-account identity-sa@from-the-hart-tech-dev.iam.gserviceaccount.com

# Create .env with required vars
cat > .env << 'EOF'
FIREBASE_PROJECT_ID=from-the-hart-tech-dev
AUTH_SERVICE_ACCOUNT_EMAIL=auth-firebase-adminsdk-fbsvc@from-the-hart-tech-dev.iam.gserviceaccount.com
FIRESTORE_DATABASE_NAME=identity
NODE_ENV=local
LOG_LEVEL=debug
EOF

npm run dev
```

On Cloud Run, the service account is attached to the instance and ADC is detected automatically — no local setup needed in production.

### Docker Configuration

Build the Docker image:

```bash
docker build \
  --build-arg NODE_ENV=local \
  --build-arg LOG_LEVEL=debug \
  --build-arg FIREBASE_PROJECT_ID=your-project-id \
  -t from-the-hart-identity .
```

Run the container:

```bash
docker run --name from_the_hart_identity -d -p 127.0.0.1:8080:8080 from-the-hart-identity
```

## 🧪 Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Generate coverage
```

## 📦 Deployment

The service is deployed to Google Cloud Run via GitHub Actions using OIDC authentication. Pushes to `dev` deploy to the dev environment, pushes to `main` deploy to prod.

## 🌐 Infrastructure

This service is part of the "From The Hart" multi-cloud infrastructure managed with Terraform. Infrastructure is defined in both this repository (`terraform/`) and the shared `from-the-hart-infrastructure` repository.

### GCP Resources

- **Cloud Run**: `from-the-hart-identity` (africa-south1)
- **Firestore**: Named database `"identity"` (africa-south1)
- **Artifact Registry**: `from-the-hart-tech` repository
- **Service Account**: `identity-sa` with `roles/datastore.user`

### IAM

- Cloud Run invoked by Auth service SA (direct `POST /identity` calls) and Cloudflare Worker SA (gateway-routed external traffic)
- GitHub Actions authenticated via Workload Identity Federation

## 📚 API Documentation

Once the server is running, Swagger documentation is available at:

```
http://localhost:8080/identity/documentation
```

## ⚙️ Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FIREBASE_PROJECT_ID` | Yes | GCP project ID |
| `AUTH_SERVICE_ACCOUNT_EMAIL` | No* | Auth service's SA email for POST /identity caller verification. Required in production, optional in mock mode. |
| `FIRESTORE_DATABASE_NAME` | No | Firestore named database (default: `"identity"`) |
| `FIRESTORE_MODE` | No | Set to `"mock"` for in-memory Firestore (no GCP needed). Used by `npm run dev:mock`. |
| `NODE_ENV` | No | Environment (default: `"local"`) |
| `LOG_LEVEL` | No | Logging level (default: `"info"`) |
| `PORT` | No | Server port (default: `8080`) |
| `HOST` | No | Server host (default: `"0.0.0.0"`) |

Firestore authentication uses **Application Default Credentials (ADC)** — no static keys needed. On Cloud Run, the `identity-sa` attached to the service provides credentials automatically via the metadata server. For local dev, use `gcloud auth application-default login` with service account impersonation.

## 📁 Project Structure

```
from-the-hart-identity/
├── src/
│   ├── app.ts                     # buildApp() factory
│   ├── server.ts                  # Local dev entry point
│   ├── config/                    # Configuration
│   │   ├── index.ts               # Env-based config
│   │   ├── logger.ts              # Pino logger
│   │   └── swagger.ts             # OpenAPI docs
│   ├── controllers/               # Route handlers (thin)
│   │   └── identityController.ts
│   ├── models/                    # TypeBox schemas
│   │   └── IdentitySchemas.ts
│   ├── routes/                    # Route definitions
│   │   └── identity.ts
│   ├── services/                  # Business logic
│   │   ├── identityService.ts     # CRUD with Firestore transactions
│   │   ├── firestore.ts           # Firebase Admin init (Firestore only, ADC-based)
│   │   └── mockFirestore.ts       # In-memory mock for FIRESTORE_MODE=mock
│   ├── public/
│   │   └── images/
│   │       └── from-the-hart.svg  # Logo for Swagger UI
│   └── preHandlers/               # Auth/authorization hooks
│       ├── domainAuth.ts          # JWT identities claim check
│       └── authServiceCaller.ts   # POST /identity caller verification
├── terraform/                     # Infrastructure as Code
│   ├── dev/                       # Dev environment
│   └── prod/                      # Prod environment
├── tests/                         # Test files (Vitest + supertest)
├── Dockerfile                     # Container build
├── package.json                   # Dependencies and scripts
├── tsconfig.json                  # TypeScript config
└── README.md                      # This file
```

## 📚 Scripts

- `npm run dev` — Dev server with real Firestore (needs ADC + .env)
- `npm run dev:mock` — Dev server with in-memory mock Firestore (sets FIRESTORE_MODE=mock, zero GCP)
- `npm run build` — Compile TypeScript
- `npm start` — Start compiled production server
- `npm test` — Run all tests (44 tests, Vitest + supertest)
- `npm run test:watch` — Watch mode
- `npm run test:coverage` — Test with coverage
