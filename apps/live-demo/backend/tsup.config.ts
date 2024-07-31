import { defineConfig } from "tsup";

export default defineConfig([
  {
    sourcemap: true,
    bundle: true,
    clean: true,
    treeshake: false,
    dts: true,
    format: "cjs",
    entry: { index: "src/index.ts" },
    target: "node16",
  },
]);
