/*
<MODULE_CONTRACT>
  <purpose>Static template strings for workshop.scaffold (RFC-0779). Each template
  is a function returning file content with placeholders substituted.</purpose>
  <non-goals>
    <item>Do not read template files from disk — templates are inline strings.</item>
    <item>Do not import from @warpgogol/* — this module is pure string generation.</item>
  </non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0779: initial workshop template strings.</item>
</CHANGE_SUMMARY>
*/

export interface WorkshopTemplateVars {
  workshopName: string;
  stackId: string;
  pluginPackage: string;
  pluginImportName: string;
  pluginExportName: string;
}

export interface WorkshopFile {
  path: string;
  content: string;
}

function rootPackageJson(vars: WorkshopTemplateVars): string {
  return JSON.stringify(
    {
      name: vars.workshopName,
      private: true,
      type: "module",
      scripts: {
        build: "pnpm exec tsc -p tsconfig.json --noEmit",
        test: "vitest run",
        format: "prettier --write .",
      },
      dependencies: {
        "@warpgogol/werkstatt": "latest",
        [vars.pluginPackage]: "latest",
        "@warpgogol/forge": "latest",
      },
    },
    null,
    2,
  ) + "\n";
}

function pnpmWorkspaceYaml(): string {
  return `packages:
  - "packages/*"
  - "services/*"
  - "missions/*/workpiece"
`;
}

function turboJson(): string {
  return JSON.stringify(
    {
      $schema: "https://turbo.build/schema.json",
      tasks: {
        build: {
          dependsOn: ["^build"],
          outputs: ["dist/**"],
        },
        test: {
          dependsOn: ["^build"],
        },
        "build:check": {
          dependsOn: ["^build"],
        },
      },
    },
    null,
    2,
  ) + "\n";
}

function kernelConfigTs(vars: WorkshopTemplateVars): string {
  return `import { defineKernelConfig } from "@warpgogol/werkstatt/kernel/types";
import { ${vars.pluginExportName} } from "${vars.pluginImportName}";

export default defineKernelConfig({
  name: "${vars.workshopName}",
  description: "${vars.workshopName} workshop",
  moduleLoaders: {
    "forge-core": async () => (await import("@warpgogol/forge/os/core")).forgeCoreModule,
    "forge-rfc": async () => (await import("@warpgogol/forge/os/rfc-module")).forgeRfcModule,
    "forge-adr": async () => (await import("@warpgogol/forge/os/adr-module")).forgeAdrModule,
    "forge-plan": async () => (await import("@warpgogol/forge/os/plan-module")).forgePlanModule,
    "forge-audit": async () => (await import("@warpgogol/forge/os/audit-module")).forgeAuditModule,
    "forge-compass": async () => (await import("@warpgogol/forge/os/compass")).forgeCompassModule,
    "forge-naming": async () => (await import("@warpgogol/forge/os/naming-module")).forgeNamingModule,
    "forge-workflow": async () => (await import("@warpgogol/forge/os/workflow-module")).forgeWorkflowModule,
    "forge-session": async () => (await import("@warpgogol/forge/os/session-module")).forgeSessionModule,
    "forge-mission": async () => (await import("@warpgogol/forge/os/mission-module")).forgeMissionModule,
    "forge-spec": async () => (await import("@warpgogol/forge/os/spec-module")).forgeSpecModule,
    "forge-exploration": async () => (await import("@warpgogol/forge/os/exploration")).forgeExplorationModule,
    "forge-werkstatt": async () => (await import("@warpgogol/forge/os/werkstatt")).forgeWerkstattModule,
    mission: async () => (await import("@warpgogol/werkstatt/mission-module")).createMissionModule(),
    sternsystem: async () => (await import("@warpgogol/werkstatt/sternsystem-module")).createSternsystemModule(),
    bordbuch: async () => (await import("@warpgogol/werkstatt/bordbuch-module")).createBordbuchModule(),
    "artifact-store": async () => (await import("@warpgogol/werkstatt/artifact-store-module")).createArtifactStoreModule(),
    release: async () => (await import("@warpgogol/werkstatt/release-module")).createReleaseModule(),
    leitstand: async () => (await import("@warpgogol/werkstatt/leitstand-module")).createLeitstandModule(),
    notausgang: async () => (await import("@warpgogol/werkstatt/notausgang-module")).createNotausgangModule(),
    evidence: async () => (await import("@warpgogol/werkstatt/evidence-module")).createEvidenceModule(),
    "werkstatt-plugin": async () => (await import("@warpgogol/werkstatt/os/werkstatt-plugin-module")).forgeWerkstattPluginModule,
    "werkstatt-autonomy": async () => (await import("@warpgogol/werkstatt/os/werkstatt-autonomy-module")).werkstattAutonomyModule,
    "${vars.workshopName}-plugin": async () => ${vars.pluginExportName},
  },
});
`;
}

function npmrc(): string {
  return `# @warpgogol scoped registry — replace YOUR_NPM_TOKEN with a valid npm read token
@warpgogol:registry=https://registry.npmjs.org/
//registry.npmjs.org/:_authToken=YOUR_NPM_TOKEN
`;
}

function tsconfigBaseJson(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "bundler",
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
      },
    },
    null,
    2,
  ) + "\n";
}

function eslintConfigJs(): string {
  return `export default [
  {
    rules: {},
  },
];
`;
}

function prettierrcMjs(): string {
  return `export default {
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  printWidth: 100,
  tabWidth: 2,
};
`;
}

function gitignore(): string {
  return `# Dependencies
node_modules/

# Build outputs
dist/
.astro/

# Mission artifacts
/missions/*/workpiece/
/missions/*/distribution/
/missions/*/evidence/axiom/

# Releases
/releases/

# Cache
.turbo/
.cache/

# Environment
.env
.env.local
.env.*.local

# OS
.DS_Store
Thumbs.db

# IDE
.idea/
.vscode/*
!.vscode/extensions.json
!.vscode/settings.json

# Forge agent memory daily logs
# forge-agent-memory
.agents/memory/daily/
# /forge-agent-memory
`;
}

function gitattributesSite(): string {
  return `# Git LFS patterns for site stack media
*.mp4 filter=lfs diff=lfs merge=lfs -text
*.webm filter=lfs diff=lfs merge=lfs -text
*.png filter=lfs diff=lfs merge=lfs -text
*.jpg filter=lfs diff=lfs merge=lfs -text
*.jpeg filter=lfs diff=lfs merge=lfs -text
*.webp filter=lfs diff=lfs merge=lfs -text
`;
}

function gitattributesEmpty(): string {
  return `# No LFS patterns for this stack
`;
}

function preCommit(): string {
  return `#!/bin/sh
# Platform-scope pre-commit guard
# Runs werkstatt autonomy and plugin validation before commits
echo "Pre-commit: running platform checks..."
pnpm exec werkstatt run werkstatt.autonomy.validate || exit 1
pnpm exec werkstatt run werkstatt.plugin.validate || exit 1
`;
}

function ciYml(vars: WorkshopTemplateVars): string {
  const stackSpecific = vars.stackId === "astro-typescript-turborepo"
    ? `      - name: Build check
        run: pnpm run build
      - name: Test
        run: pnpm run test`
    : vars.stackId === "phaser-turborepo"
      ? `      - name: Build check
        run: pnpm run build
      - name: Test
        run: pnpm run test
      - name: Bundle validate
        run: pnpm exec werkstatt run forge.validate`
      : `      - name: Build check
        run: pnpm run build
      - name: Test
        run: pnpm run test
      - name: Composition validate
        run: pnpm exec werkstatt run forge.validate`;

  return `name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          lfs: true
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - name: Install
        run: pnpm install --frozen-lockfile
      - name: Autonomy validate
        run: pnpm exec werkstatt run werkstatt.autonomy.validate
      - name: Plugin validate
        run: pnpm exec werkstatt run werkstatt.plugin.validate
${stackSpecific}
`;
}

function registryYaml(): string {
  return `# Sternsystem registry (RFC-0574)
# Each Sternsystem declares mirrors[], pin file, and bordbuch.
systems: []
`;
}

function pinnedYaml(): string {
  return `# Pinned foundation files (DNA-62, RFC-0733)
# Protect mode: warns on delete/move. Freeze mode: blocks modify too.
entries:
  - path: tools/kernel.config.ts
    mode: protect
  - path: forge.yaml
    mode: protect
  - path: pnpm-workspace.yaml
    mode: protect
  - path: turbo.json
    mode: protect
  - path: tsconfig/base.json
    mode: protect
  - path: systems/registry.yaml
    mode: protect
`;
}

function readmeMd(vars: WorkshopTemplateVars): string {
  return `# ${vars.workshopName}

A Warpgogol workshop powered by the Werkstatt engine and the ${vars.pluginPackage} plugin.

## Prerequisites

- Node.js 22+
- pnpm 10+
- Git LFS (if site stack)

## Setup

### 1. Configure npm token

This workshop depends on private @warpgogol packages. Edit \`.npmrc\` and replace \`YOUR_NPM_TOKEN\` with a valid npm read token:

\`\`\`sh
sed -i 's/YOUR_NPM_TOKEN/your_actual_token/' .npmrc
\`\`\`

### 2. Install dependencies

\`\`\`sh
pnpm install
\`\`\`

### 3. Verify the workshop

\`\`\`sh
pnpm exec werkstatt run forge.doctor
pnpm exec werkstatt run werkstatt.plugin.validate
pnpm exec werkstatt run werkstatt.autonomy.validate
\`\`\`

## Create your first project

\`\`\`sh
pnpm exec werkstatt run onboarding.scaffold --system my-first-project --title "My First Project"
\`\`\`

## Stack

- Engine: @warpgogol/werkstatt
- Plugin: ${vars.pluginPackage}
- Stack profile: ${vars.stackId}
`;
}

export function getWorkshopFiles(vars: WorkshopTemplateVars): WorkshopFile[] {
  const isSite = vars.stackId === "astro-typescript-turborepo";
  return [
    { path: "package.json", content: rootPackageJson(vars) },
    { path: "pnpm-workspace.yaml", content: pnpmWorkspaceYaml() },
    { path: "turbo.json", content: turboJson() },
    { path: "tools/kernel.config.ts", content: kernelConfigTs(vars) },
    { path: ".npmrc", content: npmrc() },
    { path: "tsconfig/base.json", content: tsconfigBaseJson() },
    { path: "eslint.config.js", content: eslintConfigJs() },
    { path: ".prettierrc.mjs", content: prettierrcMjs() },
    { path: ".gitignore", content: gitignore() },
    {
      path: ".gitattributes",
      content: isSite ? gitattributesSite() : gitattributesEmpty(),
    },
    { path: "hooks/pre-commit", content: preCommit() },
    { path: ".github/workflows/ci.yml", content: ciYml(vars) },
    { path: "systems/registry.yaml", content: registryYaml() },
    { path: "missions/.gitkeep", content: "" },
    { path: ".forge/pinned.yaml", content: pinnedYaml() },
    { path: "README.md", content: readmeMd(vars) },
  ];
}

export const STACK_PLUGIN_MAP: Record<string, {
  package: string;
  importName: string;
  exportName: string;
}> = {
  "astro-typescript-turborepo": {
    package: "@warpgogol/werkstatt-site",
    importName: "@warpgogol/werkstatt-site",
    exportName: "werkstattSitePlugin",
  },
  "phaser-turborepo": {
    package: "@warpgogol/werkstatt-game",
    importName: "@warpgogol/werkstatt-game",
    exportName: "werkstattGamePlugin",
  },
  editframe: {
    package: "@warpgogol/werkstatt-video",
    importName: "@warpgogol/werkstatt-video",
    exportName: "werkstattVideoPlugin",
  },
};
