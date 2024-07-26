const { build } = require("esbuild");

build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  outdir: "dist",
  target: ["node16"],
  format: "cjs",
}).catch(() => process.exit(1));
