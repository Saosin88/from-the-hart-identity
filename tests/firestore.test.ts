import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock firebase-admin before any imports that use it
const mockFirestore = {
  collection: vi.fn(),
  doc: vi.fn(),
};

const mockGetFirestore = vi.fn(() => mockFirestore);
const mockGetApps = vi.fn(() => []);
const mockInitializeApp = vi.fn();

vi.mock("firebase-admin/app", () => ({
  getApps: mockGetApps,
  initializeApp: mockInitializeApp,
}));

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: mockGetFirestore,
}));

describe("Firestore service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should initialize Firestore with named database 'identity'", async () => {
    // Set env for the test
    process.env.FIREBASE_PROJECT_ID = "test-project";

    // Dynamic import to reset module state
    const { initializeFirestore } = await import("../src/services/firestore");
    const db = initializeFirestore();

    expect(mockInitializeApp).toHaveBeenCalledTimes(1);
    expect(mockGetFirestore).toHaveBeenCalledWith("identity");
    expect(db).toBe(mockFirestore);
  });

  it("should be idempotent when called twice", async () => {
    // Reset module state
    vi.resetModules();

    process.env.FIREBASE_PROJECT_ID = "test-project";

    const { initializeFirestore } = await import("../src/services/firestore");
    initializeFirestore(); // First call

    // Second call — getApps returns non-empty
    mockGetApps.mockReturnValueOnce([{} as any]);
    initializeFirestore(); // Should not call initializeApp again

    expect(mockInitializeApp).toHaveBeenCalledTimes(1);
    expect(mockGetFirestore).toHaveBeenCalledWith("identity");
  });
});
