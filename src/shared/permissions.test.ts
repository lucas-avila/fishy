import { afterEach, describe, expect, it, vi } from "vitest";
import { hasRequiredOrigins, requestRequiredOrigins, REQUIRED_ORIGINS } from "./permissions";

afterEach(() => {
  // @ts-expect-error test-only cleanup of the global stub
  delete globalThis.chrome;
});

describe("hasRequiredOrigins", () => {
  it("passes REQUIRED_ORIGINS to chrome.permissions.contains and returns its result", async () => {
    const contains = vi.fn().mockResolvedValue(false);
    // @ts-expect-error partial chrome stub for this test
    globalThis.chrome = { permissions: { contains, request: vi.fn().mockResolvedValue(true) } };

    await expect(hasRequiredOrigins()).resolves.toBe(false);
    expect(contains).toHaveBeenCalledWith({ origins: REQUIRED_ORIGINS });
  });

  it("treats a missing chrome.permissions as granted", async () => {
    // @ts-expect-error partial chrome stub for this test
    globalThis.chrome = {};

    await expect(hasRequiredOrigins()).resolves.toBe(true);
  });
});

describe("requestRequiredOrigins", () => {
  it("passes REQUIRED_ORIGINS to chrome.permissions.request and returns its result", async () => {
    const request = vi.fn().mockResolvedValue(true);
    // @ts-expect-error partial chrome stub for this test
    globalThis.chrome = { permissions: { contains: vi.fn().mockResolvedValue(false), request } };

    await expect(requestRequiredOrigins()).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith({ origins: REQUIRED_ORIGINS });
  });
});
