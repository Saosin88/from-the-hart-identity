import { vi } from "vitest";
import type { IdentityRecord } from "../src/models/IdentitySchemas";

/**
 * Creates a mock Firestore instance backed by an in-memory Map.
 * Mock fails loudly on unexpected method calls (never silent defaults).
 */
export function createMockFirestore() {
  const store = new Map<string, IdentityRecord>();

  const mockDoc = vi.fn((id: string) => {
    return {
      get: vi.fn(async () => {
        const data = store.get(id) ?? null;
        return {
          exists: data !== null,
          data: () => data,
          id,
        };
      }),
      set: vi.fn(async (data: IdentityRecord) => {
        store.set(id, data);
      }),
      update: vi.fn(async (data: Partial<IdentityRecord>) => {
        const existing = store.get(id);
        if (existing) {
          store.set(id, { ...existing, ...data });
        }
      }),
    };
  });

  const mockCollection = vi.fn((name: string) => {
    if (name !== "identities") {
      throw new Error(`Unexpected collection: ${name}`);
    }
    return {
      doc: mockDoc,
    };
  });

  const mockTransaction = {
    get: vi.fn(async (docRef: any) => {
      // docRef is the return value of mockDoc — we need the doc ID
      return docRef.get();
    }),
    update: vi.fn(async (docRef: any, data: any) => {
      return docRef.update(data);
    }),
  };

  const mockRunTransaction = vi.fn(
    async (
      fn: (transaction: typeof mockTransaction) => Promise<any>
    ) => {
      return fn(mockTransaction);
    }
  );

  const mockFirestore = {
    collection: mockCollection,
    runTransaction: mockRunTransaction,
  };

  return {
    firestore: mockFirestore,
    store,
    mockDoc,
    mockCollection,
    mockRunTransaction,
    mockTransaction,
  };
}
