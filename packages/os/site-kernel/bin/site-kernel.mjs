#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const tsxLoaderUrl = pathToFileURL(require.resolve("tsx")).href;

// Resolve @warpgogol/werkstatt package directory
const werkstattPkgJson = require.resolve("@warpgogol/werkstatt/package.json");
const werkstattRoot = dirname(werkstattPkgJson);
const cliEntry = join(werkstattRoot, "src", "kernel", "cli", "index.ts");

const child = spawn(
  process.execPath,
  ["--import", tsxLoaderUrl, cliEntry, ...process.argv.slice(2)],
  {
    stdio: "inherit",
  },
);

child.on("exit", (code) => process.exit(code ?? 1));
child.on("error", (err) => {
  console.error(err);
  process.exit(1);
});
