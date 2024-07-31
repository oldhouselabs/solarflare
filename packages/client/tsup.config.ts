import { defineConfig } from "tsup";

export default defineConfig([
  {
    sourcemap: true,
    bundle: true,
    clean: true,
    treeshake: false,
    dts: true,
    format: ["esm", "cjs"],
    entry: { index: "src/index.ts" },
    outDir: "publish/dist",
    target: "es2018",
    external: ["react"],
    banner: { js: '"use client";' },
  },
]);
