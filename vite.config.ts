import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import { TARGETS, buildManifest, crxBrowser, type Target } from "./manifest/build.ts";

const target = (process.env.TARGET ?? "chrome") as Target;

if (!TARGETS.includes(target)) {
  throw new Error(`Invalid TARGET "${target}". Expected one of: ${TARGETS.join(", ")}`);
}

export default defineConfig({
  plugins: [crx({ manifest: buildManifest(target), browser: crxBrowser(target) })],
  build: {
    outDir: `dist/${target}`,
    emptyOutDir: true,
  },
});
