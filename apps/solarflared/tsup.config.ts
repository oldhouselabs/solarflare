import { defineConfig } from "tsup";
import packageJson from "./package.json";

export default defineConfig([
  {
    sourcemap: true,
    bundle: true,
    clean: true,
    treeshake: false,
    dts: true,
    format: "cjs",
    entry: { index: "src/index.ts" },
    outDir: "publish/dist",
    target: "node16",
    define: {
      __SOLARFLARED_VERSION__: JSON.stringify(packageJson.version),
    },
  },
]);
