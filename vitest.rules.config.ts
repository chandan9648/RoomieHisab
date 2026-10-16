import { defineConfig } from "vitest/config";

/**
 * Separate from `vitest.config.ts` because these tests need the Firestore
 * emulator. Run them with `npm run test:rules`, which starts it for you.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/rules/**/*.test.ts"],
    // Every assertion is a round trip to the emulator.
    testTimeout: 20_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
