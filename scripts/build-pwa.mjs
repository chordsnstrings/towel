import { readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const files = [
  "/index.html",
  "/manifest.webmanifest",
  "/move-logo.svg",
  "/favicon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/fonts/nimbus-sans-bold.otf",
];
for (const file of await readdir("dist/assets")) files.push("/assets/" + file);
const hash = createHash("sha256");
for (const file of files) hash.update(await readFile("dist" + file));
const revision = hash.digest("hex").slice(0, 16);
const template = await readFile("scripts/service-worker.js", "utf8");
await writeFile(
  "dist/sw.js",
  `const CACHE_NAME = ${JSON.stringify("move-towel-" + revision)};\nconst SHELL = ${JSON.stringify(files)};\n` +
    template,
);
console.log("PWA shell and installation manifest built.");
