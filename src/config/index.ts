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
// In test mode, skip the authServiceAccount check (tests set it) and projectId check (setup sets it)
if (env !== "test") {
  const required: Record<string, string | undefined> = {
    FIREBASE_PROJECT_ID: firestore.projectId,
    AUTH_SERVICE_ACCOUNT_EMAIL: authServiceAccount,
  };

  for (const [name, value] of Object.entries(required)) {
    if (!value) {
      throw new Error(`${name} environment variable is required`);
    }
  }
}

export const config = {
  env,
  logLevel,
  server,
  firestore,
  authServiceAccount,
};
