import { build } from "esbuild";

// Worker threads are loaded by filename at runtime, outside the function bundle.
// Bundle their dependencies here so Excel and CSV parsing work after deployment.
await build({
  entryPoints: ["server/import-worker.js"],
  outfile: ".netlify/runtime/import-worker.cjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  logLevel: "info",
});
