const esbuild = require("esbuild");

const ctx = esbuild.context({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  outdir: "dist",
  target: ["node16"],
  format: "cjs",
});

(async () => (await ctx).watch())();
