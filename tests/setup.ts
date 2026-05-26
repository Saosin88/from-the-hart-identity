// Vitest global setup for tests
process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.FIREBASE_PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID || "test-project";
process.env.AUTH_SERVICE_ACCOUNT_EMAIL =
  process.env.AUTH_SERVICE_ACCOUNT_EMAIL || "auth-sa@test-project.iam.gserviceaccount.com";
