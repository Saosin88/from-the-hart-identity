import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { config } from "../config";
import { logger } from "../config/logger";

export function initializeFirestore(): Firestore {
  try {
    if (getApps().length === 0) {
      if (!config.firestore.projectId) {
        throw new Error("FIREBASE_PROJECT_ID is required");
      }

      // Use Application Default Credentials (ADC) — same as Auth service.
      // On Cloud Run, the service account attached to the instance provides
      // short-lived credentials via the metadata server. No static keys needed.
      // For local dev: gcloud auth application-default login --impersonate-service-account <identity-sa>
      initializeApp({
        projectId: config.firestore.projectId,
      });

      logger.info(
        {
          operation: "initializeFirestore",
          projectId: config.firestore.projectId,
          databaseName: config.firestore.databaseName,
        },
        "Firestore initialized successfully with ADC"
      );
    }

    return getFirestore(config.firestore.databaseName);
  } catch (error) {
    logger.error({ error }, "Failed to initialize Firestore");
    throw new Error(
      "Firestore initialization failed. Check your credentials and environment variables."
    );
  }
}
