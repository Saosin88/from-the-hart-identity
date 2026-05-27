import { buildApp } from "./app";
import { config } from "./config";
import type { Firestore } from "firebase-admin/firestore";

// When FIRESTORE_MODE=mock, use in-memory Firestore — no GCP credentials needed.
// Otherwise, initializes real Firestore via ADC.
const isMock = process.env.FIRESTORE_MODE === "mock";

let firestoreOverride: Firestore | undefined;
if (isMock) {
  // Dynamic import to avoid loading mock code in production. Wrap in
  // a sync init function to work with ts-node-dev's CJS loader.
  const { createMockFirestore } = require("./services/mockFirestore");
  const { firestore: mockDb } = createMockFirestore();
  firestoreOverride = mockDb as any;
}

const app = buildApp(firestoreOverride);
if (isMock) {
  app.log.info("Using mock Firestore — no GCP credentials required");
}

const start = async () => {
  try {
    app.log.info(`SERVER_HOST: ${config.server.host}`);
    app.log.info(`SERVER_PORT: ${config.server.port}`);
    app.log.info(`NODE_ENV: ${config.env}`);
    await app.listen({
      port: config.server.port,
      host: config.server.host,
    });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
