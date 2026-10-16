import { describe, expect, it, vi } from "vitest";

import { WriteTimeoutError, withTimeout } from "../errors";

describe("withTimeout", () => {
  it("passes a resolved value straight through", async () => {
    await expect(withTimeout(Promise.resolve("done"), "save", 50)).resolves.toBe("done");
  });

  it("passes a rejection straight through, unchanged", async () => {
    const boom = new Error("permission denied");
    await expect(withTimeout(Promise.reject(boom), "save", 50)).rejects.toBe(boom);
  });

  it("rejects when the write is never acknowledged", async () => {
    // A Firestore write against an unreachable backend never settles at all.
    const neverSettles = new Promise<void>(() => {});
    await expect(withTimeout(neverSettles, "create the household", 20)).rejects.toBeInstanceOf(
      WriteTimeoutError,
    );
  });

  it("names the action so the message is actionable", async () => {
    const neverSettles = new Promise<void>(() => {});
    await expect(withTimeout(neverSettles, "create the household", 20)).rejects.toThrow(
      /create the household/,
    );
  });

  it("points at the likely cause: no Firestore database for the project", async () => {
    const neverSettles = new Promise<void>(() => {});
    await expect(withTimeout(neverSettles, "save", 20)).rejects.toThrow(/Cloud Firestore/);
  });

  it("clears its timer when the work wins, leaving no dangling handle", async () => {
    const clear = vi.spyOn(globalThis, "clearTimeout");
    await withTimeout(Promise.resolve(1), "save", 10_000);
    expect(clear).toHaveBeenCalled();
    clear.mockRestore();
  });
});
