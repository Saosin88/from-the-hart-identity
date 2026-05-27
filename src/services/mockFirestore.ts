import type { IdentityRecord } from "../models/IdentitySchemas";

/**
 * Creates a mock Firestore instance backed by an in-memory Map.
 * Does NOT depend on vitest — safe for ts-node-dev CJS require().
 * Used by server.ts in FIRESTORE_MODE=mock.
 */
export function createMockFirestore() {
  const store = new Map<string, IdentityRecord>();

  const mockDoc = (id: string) => {
    return {
      get: async () => {
        const data = store.get(id) ?? null;
        return {
          exists: data !== null,
          data: () => data,
          id,
        };
      },
      set: async (data: IdentityRecord) => {
        store.set(id, data);
      },
      update: async (data: Partial<IdentityRecord>) => {
        const existing = store.get(id);
        if (existing) {
          store.set(id, { ...existing, ...data });
        }
      },
    };
  };

  const mockCollection = (name: string) => {
    if (name !== "identities") {
      throw new Error(`Unexpected collection: ${name}`);
    }
    return { doc: mockDoc };
  };

  const mockTransaction = {
    get: async (docRef: any) => docRef.get(),
    update: async (docRef: any, data: any) => docRef.update(data),
  };

  const mockRunTransaction = async (fn: (t: typeof mockTransaction) => Promise<any>) => {
    return fn(mockTransaction);
  };

  const mockFirestore = {
    collection: mockCollection,
    runTransaction: mockRunTransaction,
  };

  return { firestore: mockFirestore, store, mockDoc, mockCollection, mockRunTransaction, mockTransaction };
}
