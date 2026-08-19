import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const cacheDir = join(homedir(), ".cache", "ms-playwright");

try {
  if (existsSync(cacheDir)) {
    const entries = readdirSync(cacheDir);
    if (entries.some((e) => e.startsWith("chromium"))) {
      console.log("ensure-playwright: Chromium already cached, skipping install");
      process.exit(0);
    }
  }
} catch {
  // Cache check failed — fall through to install
}

console.log("ensure-playwright: Chromium not found in cache, installing...");
const { execSync } = await import("node:child_process");
execSync("npx playwright install chromium", { stdio: "inherit" });
