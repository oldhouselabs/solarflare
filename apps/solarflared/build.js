const esbuild = require("esbuild");

const args = process.argv.slice(2);

const ctx = esbuild.context({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  outdir: "dist",
  target: ["node16"],
  format: "cjs",
});

(async () => {
  const buildContext = await ctx;

  if (args.includes("--watch")) {
    buildContext.watch();
  } else {
    buildContext.rebuild();
    process.exit(0);
  }
})();
