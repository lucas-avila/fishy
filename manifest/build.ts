import base from "./base.json" with { type: "json" };
import chrome from "./chrome.json" with { type: "json" };
import firefox from "./firefox.json" with { type: "json" };
import safari from "./safari.json" with { type: "json" };

export const TARGETS = ["chrome", "firefox", "safari"] as const;
export type Target = (typeof TARGETS)[number];

const overrides: Record<Target, object> = { chrome, firefox, safari };

export function buildManifest(target: Target) {
  return { ...base, ...overrides[target] };
}

export function crxBrowser(target: Target): "chrome" | "firefox" {
  return target === "firefox" ? "firefox" : "chrome";
}
