/*
<MODULE_CONTRACT>
<purpose>Shared types and constants for the ecosystem manifest and maintenance debt commands.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: extracted types and constants from ecosystem.ts into ecosystem/types.ts.</item>
  <item>RFC-0518: add optional gate field to EcosystemManifest commands array.</item>
</CHANGE_SUMMARY>
*/

import type { PackageTestSignal } from "../test-signal.ts";
import type { GateMetadata } from "@gogol/site-kernel";

export interface EcosystemManifest {
  meta: {
    schemaVersion: 2;
    deterministic: true;
    generatedAt: null;
    contentHash: string;
    sources: Array<{ path: string; hash: string }>;
  };
  workspace: {
    name: string;
    version: string;
    packageManager: string;
    packageGlobs: string[];
  };
  apps: Array<{ name: string; directory: string; packageName?: string }>;
  sternsystems: Array<{
    id: string;
    currentMission: string | null;
    registeredAt: string | null;
  }>;
  missions: Array<{
    id: string;
    sternsystem: string;
    status: string;
    workpiecePath: string | null;
  }>;
  packages: Array<{
    name: string;
    directory: string;
    workspacePattern: string;
    kind: "app" | "package" | "os-package" | "service" | "mission" | "other";
    dependencies: string[];
    testSignal: PackageTestSignal;
  }>;
  quality: {
    testSignals: Record<"real" | "noop" | "absent" | "skipped", number>;
    testSignalPolicy: { hasErrors: boolean; errorCount: number; warningCount: number };
    maintenanceDebtBaseline: {
      exists: boolean;
      currentItems: number;
      baselineItems: number;
      newItems: number;
      expiredItems: number;
    };
  };
  commands: Array<{
    name: string;
    scope: "app" | "workspace";
    mutatesState: boolean;
    supportsAllSites: boolean;
    providers: string[];
    gate?: GateMetadata;
  }>;
  commandProvenance: Array<{
    command: string;
    proposedBy: string[];
    addedBy: string[];
    changedBy: string[];
    removedBy: string[];
  }>;
  pipelines: Array<{
    name: string;
    scope: "app" | "workspace";
    commands: string[];
    executableFromRoot: boolean;
  }>;
  generatedOwnership: Array<{ path: string; command: string }>;
  rfcs: { accepted: number; implemented: number; draft: number; reviewing: number };
  baseline: {
    implementedRfcs: Array<{
      id: string;
      implementedAt: string;
      kind: string;
      scope: string;
      dnaRefs: string[];
    }>;
    nonImplementedRfcs: Record<string, string[]>;
    dnaRegistry: Array<{
      id: string;
      title: string;
      provenance: "foundational" | "rfc";
      establishingRfc: string | null;
      status: "active" | "reclassified" | "superseded";
    }>;
  };
}

export interface MaintenanceDebtReport {
  command: "maintenance.debt.report";
  status: "pass" | "warn" | "fail";
  items: Array<{
    sourceCommand: string;
    severity: "warning" | "info" | "skipped";
    app?: string;
    ruleId?: string;
    message: string;
    file?: string;
    line?: number;
    fixHint?: string;
  }>;
}

export type PackageJson = {
  name?: string;
  version?: string;
  packageManager?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

export const ECOSYSTEM_MANIFEST_PATH = "docs/ecosystem.generated.yaml";
export const MAINTENANCE_DEBT_BASELINE_PATH = "docs/maintenance-debt.baseline.generated.yaml";
export const MAINTENANCE_DEBT_QUEUES_PATH = "docs/maintenance-debt.queues.generated.yaml";
export const PNPM_WORKSPACE_PATH = "pnpm-workspace.yaml";
export const RFC_STATUS_KEYS = ["accepted", "implemented", "draft", "reviewing"] as const;
export const ALL_RFC_STATUS_KEYS = [
  "accepted",
  "implemented",
  "draft",
  "reviewing",
  "superseded",
  "rejected",
] as const;
export const DNA_REGISTRY_PATH = "docs/architecture-dna.md";
export const ADVISORY_APP_COMMANDS = [
  "content.asset.contract.validate",
  "asset.reference.validate",
  "content.surface.validate",
  "surface.validate",
  "demands.hierarchy.validate",
  "material.credits.validate",
  "material.metadata.validate",
  "visual.report",
  "text.normalize.report",
  "content.claim.report",
  "content.freshness.report",
  "content.plan.status",
] as const;
