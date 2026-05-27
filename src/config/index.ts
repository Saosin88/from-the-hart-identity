const logLevel = process.env.LOG_LEVEL || "info";
const env = process.env.NODE_ENV || "local";

const server = {
  port: process.env.PORT ? parseInt(process.env.PORT, 10) : 8080,
  host: process.env.HOST || "0.0.0.0",
};

const firestore = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  databaseName: process.env.FIRESTORE_DATABASE_NAME || "identity",
};

const authServiceAccount = process.env.AUTH_SERVICE_ACCOUNT_EMAIL;

// Fail-fast validation: these env vars are required for the service to function
// In test/mock mode, validation is relaxed — tests and local dev can skip GCP setup.
if (env !== "test" && process.env.FIRESTORE_MODE !== "mock") {
  if (!firestore.projectId) {
    throw new Error("FIREBASE_PROJECT_ID environment variable is required");
  }

  // AUTH_SERVICE_ACCOUNT_EMAIL is required in production, optional in mock mode
  if (!authServiceAccount) {
    throw new Error("AUTH_SERVICE_ACCOUNT_EMAIL environment variable is required");
  }
}

export const config = {
  env,
  logLevel,
  server,
  firestore,
  authServiceAccount,
};
