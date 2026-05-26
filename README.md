# From The Hart Identity API

A Fastify-based identity domain store for From The Hart services. This API provides Identity profile management — a pure domain store with no authentication or authorization logic, backed by Firestore and deployed as a containerized service on Google Cloud Run.

![Status](https://img.shields.io/badge/Status-Live-success)
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
- Docker (for containerized deployment)
- Google Cloud SDK (for Cloud Run deployment)
- GCP project with Firestore enabled

## 🚀 Getting Started

### Installation

```bash
git clone https://github.com/Saosin88/from-the-hart-identity.git
cd from-the-hart-identity
npm install
```

### Local Development

Before starting the application locally, set up Application Default Credentials for Firestore access:

```bash
# Impersonate the identity service account to use ADC locally
gcloud auth application-default login --impersonate-service-account identity-sa@from-the-hart-tech-dev.iam.gserviceaccount.com
```

This is the same pattern used by the Auth service. On Cloud Run, the service account is attached to the instance and ADC is detected automatically.

To start the server in development mode:

```bash
npm run dev
```

This will start the server with hot-reload enabled at http://localhost:8080.

### Docker Configuration

Build the Docker image:

```bash
docker build \
  --build-arg NODE_ENV=local \
  --build-arg LOG_LEVEL=debug \
  --build-arg FIREBASE_PROJECT_ID=your-project-id \
  --build-arg FIREBASE_CLIENT_EMAIL=your-sa-email \
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
| `AUTH_SERVICE_ACCOUNT_EMAIL` | Yes | Auth service's SA email for POST /identity caller verification |
| `FIRESTORE_DATABASE_NAME` | No | Firestore named database (default: `"identity"`) |
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
│   │   └── firestore.ts           # Firebase Admin init (Firestore only)
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

- `npm run dev` — Start development server
- `npm run build` — Compile TypeScript
- `npm start` — Start production server
- `npm test` — Run tests
- `npm run test:watch` — Watch mode
- `npm run test:coverage` — Test with coverage
