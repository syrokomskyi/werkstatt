import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const sitePkgPath = join(root, "packages/werkstatt-site/package.json");
const pkg = JSON.parse(readFileSync(sitePkgPath, "utf-8"));

// Remove all existing share/astro exports first
const newExports = {};
const seenKeys = new Set();

for (const [key, val] of Object.entries(pkg.exports)) {
  if (key.startsWith("./share/astro")) {
    continue; // skip all existing share/astro exports
  }
  if (seenKeys.has(key)) {
    continue; // skip duplicates
  }
  seenKeys.add(key);
  newExports[key] = val;
}

// Add back the share/astro exports we need
const astroExports = {
  "./share/astro/canonical-url": {
    "types": "./src/domain/share/astro/canonical-url.ts",
    "default": "./src/domain/share/astro/canonical-url.ts",
  },
  "./share/astro/content": {
    "types": "./src/domain/share/astro/content.ts",
    "default": "./src/domain/share/astro/content.ts",
  },
  "./share/astro/deployment-gate": {
    "types": "./src/domain/share/astro/deployment-gate.ts",
    "default": "./src/domain/share/astro/deployment-gate.ts",
  },
  "./share/astro/feature-graph": {
    "types": "./src/domain/share/astro/feature-graph.ts",
    "default": "./src/domain/share/astro/feature-graph.ts",
  },
  "./share/astro/feature-policy": {
    "types": "./src/domain/share/astro/feature-policy.ts",
    "default": "./src/domain/share/astro/feature-policy.ts",
  },
  "./share/astro/loaders": {
    "types": "./src/domain/share/astro/loaders.ts",
    "default": "./src/domain/share/astro/loaders.ts",
  },
  "./share/astro/page-handler": {
    "types": "./src/domain/share/astro/page-handler/resolve-route.ts",
    "default": "./src/domain/share/astro/page-handler/resolve-route.ts",
  },
  "./share/astro/people": {
    "types": "./src/domain/share/astro/people.ts",
    "default": "./src/domain/share/astro/people.ts",
  },
  "./share/astro/people-profile-defaults": {
    "types": "./src/domain/share/astro/people-profile-defaults.ts",
    "default": "./src/domain/share/astro/people-profile-defaults.ts",
  },
  "./share/astro/root-redirect-content": {
    "types": "./src/domain/share/astro/root-redirect-content.astro",
    "default": "./src/domain/share/astro/root-redirect-content.astro",
  },
  "./share/astro/root-redirect-content.astro": {
    "types": "./src/domain/share/astro/root-redirect-content.astro",
    "default": "./src/domain/share/astro/root-redirect-content.astro",
  },
  "./share/astro/surface-routes": {
    "types": "./src/domain/share/astro/surface-routes.ts",
    "default": "./src/domain/share/astro/surface-routes.ts",
  },
  "./share/astro/url-policy": {
    "types": "./src/domain/share/astro/url-policy.ts",
    "default": "./src/domain/share/astro/url-policy.ts",
  },
};

// Insert astro exports after ./checks/pipelines
const finalExports = {};
for (const [key, val] of Object.entries(newExports)) {
  finalExports[key] = val;
  if (key === "./checks/pipelines") {
    for (const [akey, aval] of Object.entries(astroExports)) {
      finalExports[akey] = aval;
    }
  }
}

pkg.exports = finalExports;

writeFileSync(sitePkgPath, JSON.stringify(pkg, null, 2) + "\n");
console.log("Fixed share/astro exports");
