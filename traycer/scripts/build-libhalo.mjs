import { execSync } from "child_process";

execSync(
  [
    "npx esbuild scripts/libhalo-entry.mjs",
    "--bundle",
    "--outfile=public/libhalo.js",
    "--format=iife",
    "--platform=browser",
    "--define:global=globalThis",
    "--alias:crypto=crypto-browserify",
    "--alias:stream=stream-browserify",
    "--alias:events=events",
    "--inject:scripts/libhalo-inject.mjs",
  ].join(" "),
  { stdio: "inherit" },
);

console.log("✓ public/libhalo.js built");
