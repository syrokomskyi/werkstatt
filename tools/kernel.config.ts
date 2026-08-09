/*
<MODULE_CONTRACT>
<purpose>Workspace-level kernel configuration for Warpgogol platform.</purpose>
<keywords>workspace, configuration, platform</keywords>
<responsibilities>
  <item>Registers workspace-scoped modules and commands.</item>
  <item>Defines pipelines that operate on the entire workspace.</item>
  <item>Provides global configuration for all apps.</item>
</responsibilities>
<non-goals>
  <item>Do not define app-specific configuration.</item>
  <item>Do not manage app-level pipelines.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="icons.generate">Generates icon components for @warpgogol/ui package.</entry>
  <entry key="onboarding.scaffold">Generates a fully RFC-compliant new app skeleton (RFC-0029 / DNA-36).</entry>
  <entry key="onboarding.checklist">Emits a readiness report for an in-progress app (RFC-0029 / DNA-36).</entry>
  <entry key="kernel.wire">Generates app-local tools/ kernel wiring from system.md (RFC-0078).</entry>
  <entry key="handoff.validate">Validates RFC-0221 internal site handoff bundles.</entry>
  <entry key="migrator.registry.validate">Validates RFC-0479 migrator registry (id uniqueness, ordering, test coverage).</entry>
  <entry key="mission.migrate">Applies pending RFC-0479 migrators to a mission workpiece.</entry>
  <entry key="rfc.*">Registers workspace RFC governance commands at the repository root.</entry>
  <entry key="adr.*">Registers workspace ADR governance commands at the repository root (RFC-0366, RFC-0521 forge migration).</entry>
  <entry key="plan.archive">Registers workspace plan archive command (RFC-0521).</entry>
  <entry key="audit.archive">Registers workspace audit archive command (RFC-0521).</entry>
  <entry key="docs.archive">Registers workspace umbrella archive command (RFC-0521).</entry>
  <entry key="session.*">Registers workspace session documentation domain commands (RFC-0537).</entry>
  <entry key="lagebild.*">Registers workspace Lagebild commands at the repository root.</entry>
  <entry key="swim.*">Registers workspace SWIM membership commands (RFC-0564).</entry>
  <entry key="commit.message.lint">RFC-0265: commit message hygiene lint.</entry>
  <entry key="pipeline.budget.generate">RFC-0270: derive pipeline timing budgets from local telemetry.</entry>
  <entry key="command.manifest.generate">RFC-0266: generate the single machine-readable command manifest.</entry>
  <entry key="kernel.cache.*">RFC-0382: kernel cache status and clear commands.</entry>
  <entry key="compass.*">Registers workspace Compass commands at the repository root (RFC-0374).</entry>
  <entry key="spec.*">Registers workspace spec vendoring commands: spec.validate, spec.status, spec.materialize (RFC-0394..0397).</entry>
  <entry key="dht.*">Registers workspace DHT commands: dht.node.init, dht.lookup, dht.register, dht.placement, dht.status, dht.capacity.publish (RFC-0565).</entry>
  <entry key="deploy.*">Registers workspace deploy commands: deploy.artifact.build, deploy.artifact.verify, deploy.atomic.swap, deploy.atomic.rollback, deploy.artifact.gc, deploy.status (RFC-0566).</entry>
  <entry key="evidence.*">Registers workspace evidence commands: evidence.sync, evidence.fetch (RFC-0651).</entry>
  <entry key="subdomain.*">Registers workspace subdomain commands: subdomain.register, subdomain.validate, subdomain.list (RFC-0752).</entry>
  <entry key="dns.*">Registers workspace DNS record commands: dns.record.upsert, dns.record.validate, dns.record.list, dns.record.delete, dns.records.schema.validate (RFC-0753).</entry>
  <entry key="nachweis.*">Registers workspace nachweis commands: nachweis.ingest, nachweis.validate, nachweis.manifest.generate, nachweis.consent.update, nachweis.publish, nachweis.withdraw (RFC-0707).</entry>
  <entry key="exploration.*">Registers workspace exploration note commands: exploration.list, exploration.show, exploration.archive (RFC-0710).</entry>
  <entry key="werkstatt.plugin.validate">Registers workspace plugin contract validation command (RFC-0770).</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial workspace-level kernel configuration.</item>
  <item>RFC-0029: Add onboardingModule for onboarding.scaffold + onboarding.checklist commands.</item>
  <item>RFC-0078: Add workspace-scoped kernel.wire command.</item>
  <item>RFC-0221: Register handoff.validate and migrator.validate workspace commands.</item>
  <item>RFC-0479: Replace migrator.validate with migrator.registry.validate; register mission.migrate.</item>
  <item>Register RFC and Lagebild modules at the workspace root to avoid app-context fallback.</item>
  <item>RFC-0265: Register commitMessageModule for commit.message.lint.</item>
  <item>RFC-0270: Register pipelineBudgetModule for pipeline.budget.generate.</item>
  <item>RFC-0266: Register commandManifestModule for command.manifest.generate.</item>
  <item>RFC-0354: Register sternsystem module for sternsystem.register/list/validate/pin/extract/sync.</item>
  <item>RFC-0366: Register adrModule for adr.create/validate/list.</item>
  <item>RFC-0521: Migrate adrModule to forgeAdrModule; register forgePlanModule and forgeAuditModule.</item>
  <item>Register forgeNamingModule at the workspace root so packages.check can run naming.convention.lint without an app context.</item>
  <item>Register forgeCompassModule at the workspace root so packages.check can run compass.validate without an app context.</item>
  <item>RFC-0394..0397: Register forgeSpecModule for spec.validate, spec.status, spec.materialize.</item>
  <item>RFC-0478: Register platform module for platform.consistency.validate.</item>
  <item>RFC-0537: Register forgeSessionModule for session.save, session.archive, session.validate, session.list.</item>
  <item>RFC-0573: Register forgeMissionModule for mission.archive.</item>
  <item>RFC-0565: Register dhtModule for dht.node.init, dht.lookup, dht.register, dht.placement, dht.status, dht.capacity.publish.</item>
  <item>RFC-0564: Register swimModule for swim.join, swim.leave, swim.members, swim.status.</item>
  <item>RFC-0566: Register deployModule for deploy.artifact.build, deploy.artifact.verify, deploy.atomic.swap, deploy.atomic.rollback, deploy.artifact.gc, deploy.status.</item>
  <item>RFC-0651: Register evidenceModule for evidence.sync, evidence.fetch.</item>
  <item>RFC-0707: Register nachweisModule for nachweis.ingest, nachweis.validate, nachweis.manifest.generate, nachweis.consent.update, nachweis.publish, nachweis.withdraw.</item>
  <item>RFC-0710: Register forgeExplorationModule for exploration.list, exploration.show, exploration.archive.</item>
  <item>RFC-0752: Register subdomainModule for subdomain.register, subdomain.validate, subdomain.list.</item>
  <item>RFC-0753: Register dnsModule for dns.record.upsert, dns.record.validate, dns.record.list, dns.record.delete, dns.records.schema.validate.</item>
  <item>RFC-0770: Register werkstatt-plugin module for werkstatt.plugin.validate.</item>
</CHANGE_SUMMARY>
*/

import { defineKernelConfig } from "@warpgogol/site-kernel/types";
import { PACKAGES_CHECK_PIPELINE } from "@warpgogol/site-kernel-checks/pipelines/packages-check";

export default defineKernelConfig({
  name: "warpgogol-platform",
  description: "Warpgogol platform workspace configuration",
  moduleLoaders: {
    icons: async () => (await import("@warpgogol/site-kernel/icons")).iconsModule,
    "forge-core": async () => (await import("@warpgogol/forge/os/core")).forgeCoreModule,
    "forge-compass": async () => (await import("@warpgogol/forge/os/compass")).forgeCompassModule,
    "forge-naming": async () =>
      (await import("@warpgogol/forge/os/naming-module")).forgeNamingModule,
    workflow: async () => (await import("@warpgogol/forge/os/workflow-module")).forgeWorkflowModule,
    rfc: async () => (await import("@warpgogol/forge/os/rfc-module")).forgeRfcModule,
    adr: async () => (await import("@warpgogol/forge/os/adr-module")).forgeAdrModule,
    "forge-plan": async () => (await import("@warpgogol/forge/os/plan-module")).forgePlanModule,
    "forge-audit": async () => (await import("@warpgogol/forge/os/audit-module")).forgeAuditModule,
    "forge-session": async () =>
      (await import("@warpgogol/forge/os/session-module")).forgeSessionModule,
    "forge-mission": async () =>
      (await import("@warpgogol/forge/os/mission-module")).forgeMissionModule,
    lagebild: async () => (await import("@warpgogol/site-kernel/lagebild-module")).lagebildModule,
    "commit-message": async () =>
      (await import("@warpgogol/site-kernel/commit-message")).commitMessageModule,
    "pipeline-budget": async () =>
      (await import("@warpgogol/site-kernel/pipeline-budget")).pipelineBudgetModule,
    "command-manifest": async () =>
      (await import("@warpgogol/site-kernel/command-manifest-module")).commandManifestModule,
    cache: async () => (await import("@warpgogol/site-kernel/cache-module")).cacheModule,
    check: async () =>
      (await import("@warpgogol/site-kernel-checks/module")).createStandardCheckModule(),
    observability: async () =>
      (await import("@warpgogol/site-kernel-observability/module")).observabilityModule,
    onboarding: async () =>
      (await import("@warpgogol/site-kernel-onboarding/module")).createOnboardingModule(),
    handoff: async () =>
      (await import("@warpgogol/site-kernel-handoff/handoff-module")).createHandoffModule(),
    sternsystem: async () =>
      (await import("@warpgogol/site-kernel-handoff/sternsystem-module")).createSternsystemModule(),
    "forge-werkstatt": async () =>
      (await import("@warpgogol/forge/os/werkstatt")).forgeWerkstattModule,
    "forge-spec": async () => (await import("@warpgogol/forge/os/spec-module")).forgeSpecModule,
    mission: async () =>
      (await import("@warpgogol/site-kernel-handoff/mission-module")).createMissionModule(),
    bordbuch: async () =>
      (await import("@warpgogol/site-kernel-handoff/bordbuch-module")).createBordbuchModule(),
    "artifact-store": async () =>
      (
        await import("@warpgogol/site-kernel-handoff/artifact-store-module")
      ).createArtifactStoreModule(),
    "behavior-snapshot": async () =>
      (
        await import("@warpgogol/site-kernel-handoff/behavior-snapshot-module")
      ).createBehaviorSnapshotModule(),
    release: async () =>
      (await import("@warpgogol/site-kernel-handoff/release-module")).createReleaseModule(),
    leitstand: async () =>
      (await import("@warpgogol/site-kernel-handoff/leitstand-module")).createLeitstandModule(),
    subdomain: async () =>
      (await import("@warpgogol/site-kernel-handoff/subdomain-module")).createSubdomainModule(),
    dns: async () => (await import("@warpgogol/site-kernel-handoff/dns-module")).createDnsModule(),
    notausgang: async () =>
      (await import("@warpgogol/site-kernel-handoff/notausgang-module")).createNotausgangModule(),
    platform: async () =>
      (await import("@warpgogol/site-kernel-handoff/platform-module")).createPlatformModule(),
    gitmesh: async () => (await import("@warpgogol/site-kernel")).gitmeshModule,
    identity: async () =>
      (await import("@warpgogol/site-kernel-handoff/identity-module")).createIdentityModule(),
    dht: async () => (await import("@warpgogol/site-kernel/dht-module")).dhtModule,
    swim: async () => (await import("@warpgogol/site-kernel/swim-module")).swimModule,
    deploy: async () =>
      (await import("@warpgogol/site-kernel-handoff/deploy-module")).createDeployModule(),
    evidence: async () =>
      (await import("@warpgogol/site-kernel-handoff/evidence-module")).createEvidenceModule(),
    nachweis: async () =>
      (await import("@warpgogol/site-kernel-handoff/nachweis-module")).createNachweisModule(),
    "forge-exploration": async () =>
      (await import("@warpgogol/forge/os/exploration")).forgeExplorationModule,
    "werkstatt-plugin": async () =>
      (await import("@warpgogol/werkstatt/os/werkstatt-plugin-module")).forgeWerkstattPluginModule,
    "werkstatt-autonomy": async () =>
      (await import("@warpgogol/werkstatt/os/werkstatt-autonomy-module")).werkstattAutonomyModule,
  },
  pipelines: {
    // Workspace-level pipelines
    "icons.generate": [{ command: "icons.generate" }],
    "packages.check": [...PACKAGES_CHECK_PIPELINE],
  },
});
