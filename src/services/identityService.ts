import { randomUUID } from "crypto";
import { Firestore } from "firebase-admin/firestore";
import { IdentityRecord } from "../models/IdentitySchemas";
import { logger } from "../config/logger";

export interface CreateIdentityDto {
  email: string;
  first_name: string;
  last_name: string;
  identity_type: "person";
}

export interface UpdateIdentityDto {
  first_name?: string;
  last_name?: string;
}

export class IdentityService {
  constructor(private readonly db: Firestore) {}

  async createIdentity(data: CreateIdentityDto): Promise<{ identity_id: string }> {
    const identityId = randomUUID();
    const now = new Date().toISOString();

    const record: IdentityRecord = {
      identity_id: identityId,
      email: data.email,
      first_name: data.first_name,
      last_name: data.last_name,
      identity_type: data.identity_type,
      created_at: now,
      updated_at: now,
    };

    try {
      await this.db
        .collection("identities")
        .doc(identityId)
        .set(record);

      logger.info(
        { operation: "createIdentity", identityId },
        "Identity created successfully"
      );

      return { identity_id: identityId };
    } catch (error) {
      logger.error(
        { operation: "createIdentity", identityId, error },
        "Failed to create identity"
      );
      throw new Error("Failed to create identity");
    }
  }

  async getIdentity(identityId: string): Promise<IdentityRecord | null> {
    try {
      const doc = await this.db
        .collection("identities")
        .doc(identityId)
        .get();

      if (!doc.exists) {
        return null;
      }

      return doc.data() as IdentityRecord;
    } catch (error) {
      logger.error(
        { operation: "getIdentity", identityId, error },
        "Failed to get identity"
      );
      throw new Error("Failed to get identity");
    }
  }

  async updateIdentity(
    identityId: string,
    data: UpdateIdentityDto
  ): Promise<IdentityRecord | null> {
    try {
      // Use a Firestore transaction for atomic read-write
      const result = await this.db.runTransaction(async (transaction) => {
        const docRef = this.db.collection("identities").doc(identityId);
        const doc = await transaction.get(docRef);

        if (!doc.exists) {
          return null;
        }

        const existing = doc.data() as IdentityRecord;
        const now = new Date().toISOString();

        const updated: IdentityRecord = {
          ...existing,
          first_name: data.first_name ?? existing.first_name,
          last_name: data.last_name ?? existing.last_name,
          updated_at: now,
        };

        transaction.update(docRef, updated);

        return updated;
      });

      if (result) {
        logger.info(
          { operation: "updateIdentity", identityId },
          "Identity updated successfully"
        );
      }

      return result;
    } catch (error) {
      logger.error(
        { operation: "updateIdentity", identityId, error },
        "Failed to update identity"
      );
      throw new Error("Failed to update identity");
    }
  }
}
