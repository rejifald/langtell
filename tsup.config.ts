import { defineConfig } from "tsup";

// One entry per public subpath. ESM-only, with code-splitting so the shared
// core lands in a chunk reused across entries (so importing `langtell/franc`
// plus the root never duplicates the core). The heavy engines (franc) are
// externalized automatically because `franc` is a peer dependency.
export default defineConfig({
  entry: {
    index: "src/index.ts",
    text: "src/text.ts",
    html: "src/html.ts",
    headers: "src/headers.ts",
    profiles: "src/profiles.ts",
    fuse: "src/fuse.ts",
    franc: "src/franc.ts",
    "chrome-ai": "src/chrome-ai.ts",
  },
  format: ["esm"],
  target: "es2022",
  dts: true,
  treeshake: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  outDir: "dist",
});
