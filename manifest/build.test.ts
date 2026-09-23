import { describe, expect, it } from "vitest";
import { buildManifest } from "./build";

describe("buildManifest", () => {
  it("chrome uses a service_worker and no scripts array", () => {
    const manifest = buildManifest("chrome") as any;
    expect(manifest.background.service_worker).toBe("src/background.ts");
    expect(manifest.background.scripts).toBeUndefined();
  });

  it("firefox uses background.scripts and no service_worker", () => {
    const manifest = buildManifest("firefox") as any;
    expect(manifest.background.scripts[0]).toBe("src/background.ts");
    expect(manifest.background.service_worker).toBeUndefined();
    expect(manifest.browser_specific_settings.gecko.id).toBeTruthy();
    expect(manifest.options_ui.page).toBe("src/options/index.html");
  });

  it("safari matches chrome for background", () => {
    const chrome = buildManifest("chrome") as any;
    const safari = buildManifest("safari") as any;
    expect(safari.background).toEqual(chrome.background);
  });

  it("shares common fields across all targets", () => {
    const chrome = buildManifest("chrome") as any;
    const firefox = buildManifest("firefox") as any;
    const safari = buildManifest("safari") as any;

    for (const key of [
      "name",
      "version",
      "permissions",
      "host_permissions",
      "content_scripts",
      "icons",
    ] as const) {
      expect(firefox[key]).toEqual(chrome[key]);
      expect(safari[key]).toEqual(chrome[key]);
    }
  });
});
