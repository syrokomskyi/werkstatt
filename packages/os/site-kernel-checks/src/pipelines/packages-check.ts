/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/pipelines/packages-check.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not validate app-specific business logic or authored content.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted from module.ts.</item>
  <item>Remove app-scoped token lints from packages-check; sites-check.author owns app style validation.</item>
  <item>RFC-0246: Add workspace.surface.validate after ACP drift validation.</item>
  <item>RFC-0249: Add warning-mode test.signal.validate to the autonomous package quality gate.</item>
  <item>RFC-0251: Add test signal policy and maintenance debt baseline drift validation.</item>
  <item>RFC-0256: Add advisory maintenance debt queue validation after baseline validation.</item>
  <item>RFC-0258: Add fail-hard workspace.write.boundary.lint next to generator.ownership.lint.</item>
  <item>RFC-0260: Add kernel.flags.lint after pipeline timeout validation.</item>
  <item>RFC-0261: Add check.fixture.lint after kernel.flags.lint.</item>
  <item>RFC-0262: Add props.contract.validate after check.fixture.lint.</item>
  <item>RFC-0263: Add cosmic.literals.lint after cosmic.name.unique.</item>
  <item>RFC-0264: Add barrel.size.lint after import.extensions.lint.</item>
  <item>RFC-0266: Add command.manifest.validate before docs.commands.validate.</item>
  <item>RFC-0267: Add kernel.io.lint after kernel.flags.lint.</item>
  <item>RFC-0610: Add command.args.validate after kernel.io.lint.</item>
  <item>RFC-0303: Add fs.walk.lint, dedup.helper.lint, file.size.lint after barrel.size.lint.</item>
  <item>RFC-0311: Add offline IndexNow submit contract validation.</item>
  <item>RFC-0364: Add fingerprint.usage.lint (warning mode) and fingerprint.fixtures.validate.</item>
  <item>RFC-0366: Add fail-hard adr.validate after rfc.dna.trace.validate.</item>
</CHANGE_SUMMARY>
*/

import type { KernelPipelineStep } from "@warpgogol/site-kernel";

export const PACKAGES_CHECK_PIPELINE: KernelPipelineStep[] = [
  { command: "manifest.contract.validate" },
  // RFC-0158: canonical DNA registry stays in sync with the establishing RFCs
  { command: "dna.registry.validate" },
  // RFC-0331: validate the bidirectional DNA-trace matrix (satisfies ↔ invariants)
  { command: "rfc.dna.trace.validate" },
  // RFC-0366: validate ADR frontmatter and referential integrity (fail-hard)
  { command: "adr.validate" },
  { command: "section.contract.validate" },
  // RFC-0156: audit packages/ui renderers for surviving legacy effect props
  { command: "effects.coverage.audit" },
  { command: "shared-ui.thin-copy.validate" },
  { command: "biome.contract.validate" },
  // tokens.catalog.sync — drift guard between tokens.css and TOKEN_NAMES
  { command: "tokens.catalog.sync" },
  { command: "family.contract.validate" },
  { command: "archetype.registry.validate" },
  // RFC-0091: validate derived planetImportPaths and blockTypeToCosmicName are fresh
  { command: "planet.import-paths.lint" },
  { command: "constellation.contract.validate" },
  { command: "cosmic.catalog.validate" },
  { command: "cosmic.name.unique" },
  // RFC-0263: dispatch code must derive cosmic-name-keyed behavior from the archetype registry, never literals
  { command: "cosmic.literals.lint" },
  { command: "naming.convention.lint" },
  // RFC-0362: Werkstatt commands must use shared lock/idempotency/atomic-write helpers
  { command: "werkstatt.operation.validate" },
  { command: "uni.registry.validate" },
  // RFC-0087: generator ownership lint — detect multi-owner generated files
  { command: "generator.ownership.lint" },
  // RFC-0258: workspace-shared writes must be atomic and allowlisted (fail-hard)
  { command: "workspace.write.boundary.lint" },
  // RFC-0089: Astro subpath exports must include .astro extension (dual-key contract)
  { command: "astro.exports.lint" },
  // RFC-0092: import-extension and tsconfig-shape invariants
  { command: "import.extensions.lint" },
  // RFC-0264: root barrel size + subpath/barrel export duplication guard
  { command: "barrel.size.lint" },
  // RFC-0303: shared fs/text helper dedup + oversized-file guard rails
  { command: "fs.walk.lint" },
  { command: "dedup.helper.lint" },
  { command: "file.size.lint" },
  { command: "tsconfig.shape.lint" },
  // RFC-0266: single machine-readable command manifest must not drift
  { command: "command.manifest.validate" },
  // RFC-0222: generated human-facing command docs must not drift
  { command: "docs.commands.validate" },
  // RFC-0245: generated machine-readable Agent Control Plane must not drift
  { command: "ecosystem.manifest.validate" },
  // RFC-0246: workspace package and root-pipeline surface must be represented in ACP
  { command: "workspace.surface.validate" },
  // RFC-0519: gate catalog must not drift from live command registrations
  { command: "gate.catalog.validate" },
  // RFC-0253: shared workspace discovery must remain deterministic and classified.
  { command: "workspace.discovery.validate" },
  // RFC-0557: validate that template @warpgogol/* imports resolve from root devDependencies.
  { command: "template.imports.validate" },
  // RFC-0249: package test posture is explicit even when coverage remains warning-mode debt.
  { command: "test.signal.validate" },
  // RFC-0251: skipped-test intent and advisory-debt backlog are owned and diffable.
  { command: "test.signal.policy.validate" },
  { command: "maintenance.debt.baseline.validate" },
  { command: "maintenance.debt.queue.validate" },
  // RFC-0250: shared runtime fallback/warning classes must have static diagnostics.
  { command: "section.defaults.validate" },
  { command: "runtime.warnings.lint" },
  // RFC-0093: section components must render real content, not JSON dumps
  { command: "section.placeholder.lint" },
  // RFC-0111: static validator suite for the RFC-0101..RFC-0106 section framework
  { command: "section.shell.contract.validate" },
  { command: "section.background.contract.validate" },
  { command: "section.header.contract.validate" },
  { command: "section.body.contract.validate" },
  { command: "section.cta.contract.validate" },
  { command: "section.image.contract.validate" },
  // RFC-0598: colocated CSS import integrity
  { command: "section.css.import.validate" },
  // RFC-0122: section-framework component CSS token contract
  { command: "tokens.colors.section-shell.lint" },
  // RFC-0124: section-framework token references must exist in TOKEN_NAME_SET
  { command: "tokens.section-shell.contract.validate" },
  // RFC-0119: shared section props fragment catalog versioning
  { command: "shared.section-props.contract.validate" },
  // RFC-0219: drift-guard the generated deal-lifecycle state chart
  { command: "funnel.statechart.validate" },
  { command: "compass.validate" },
  { command: "workflow.lint" },
  // RFC-0374: forge skill validation
  { command: "forge.skill.validate" },
  // RFC-0082: prevent regression to direct YAML.parse of onboarding artifacts.
  { command: "onboarding.yaml.import.lint" },
  // RFC-0189: hardcoded strings in shared UI components
  { command: "ui.i18n.lint" },
  // RFC-0230: hardcoded strings in UI-facing @warpgogol/share helpers
  { command: "share.i18n.lint" },
  // RFC-0205: silent empty-string fallbacks on UI-visible props
  { command: "ui.silent-defaults.lint" },
  // RFC-0203: diagnostic shape governance (warning-mode migration signal + registered ruleIds)
  { command: "diagnostic.shape.lint" },
  // RFC-0247: actionable warnings must be canonical Diagnostic[] entries.
  { command: "warning.diagnostics.lint" },
  // RFC-0254: standard build/check paths use structured, deduplicated logs.
  { command: "pipeline.log.hygiene.validate" },
  // RFC-0255: long-running pipeline paths declare coherent timing/timeout metadata.
  { command: "pipeline.timeout.validate" },
  // RFC-0260: typed kernel command flag schemas — undeclared flag reads + heuristic-path ratchet.
  { command: "kernel.flags.lint" },
  // RFC-0267: command modules must receive IO from context.io, not ambient node:fs — shrink-only ratchet.
  { command: "kernel.io.lint" },
  // RFC-0610: flag-only argument pattern enforcement — no input.args reads, no dual-path fallbacks.
  { command: "command.args.validate" },
  // RFC-0261: shrink-only ratchet on *.validate/*.lint fixture coverage (DSL-04 rides the existing diagnostic.shape.lint step above).
  { command: "check.fixture.lint" },
  // RFC-0262: manifest propsSchema is the single authored prop contract for packages/ui.
  { command: "props.contract.validate" },
  // RFC-0305: analytics ontology, binding, proxy, and offline fleet-control scaffolding.
  { command: "analytics.messkanon.validate" },
  { command: "analytics.binding.validate" },
  { command: "matomo.proxy.validate" },
  { command: "matomo.provision.validate" },
  { command: "matomo.smoke.validate" },
  { command: "matomo.silence.validate" },
  { command: "matomo.export.validate" },
  // RFC-0290: @warpgogol/agent-gate MCP + action conformance corpus regression gate.
  { command: "agent.gate.fixtures.run" },
  // RFC-0311: offline validation for IndexNow payload shape, filtering, and batching.
  { command: "indexnow.submit.validate" },
  // RFC-0336: managed .gitattributes generated-artifact block must not drift.
  { command: "gitattributes.validate" },
  // RFC-0337: closed telemetry conventions — every metric name/label key is declared.
  { command: "observability.conventions.validate" },
  // RFC-0338: SigNoz stack config lint — required files, Caddy auth, collector patch.
  { command: "observability.stack.validate" },
  // RFC-0339: Workers traces export — every wrangler config exports to signoz.
  { command: "observability.workers.validate" },
  // RFC-0341: Fleet probe target list is fresh, schema-valid, and fleet-only.
  { command: "fleet.probe.validate" },
  // RFC-0342: Alert rule projection is fresh, schema-valid, metrics declared.
  { command: "observability.alerts.validate" },
  // RFC-0343: CF analytics poller zone map and boundary validation.
  { command: "observability.delivery.validate" },
  // RFC-0344: SigNoz MCP server entry, no committed secrets, incidents template.
  { command: "observability.mcp.validate" },
  // RFC-0364: semantic fingerprint governance — warning mode during migration.
  { command: "fingerprint.usage.lint", args: ["--mode", "warning"] },
  // RFC-0364: validate fingerprint fixture pairs.
  { command: "fingerprint.fixtures.validate" },
  // RFC-0478: platform semantic hash drift guard and version bump enforcement.
  { command: "platform.consistency.validate", args: ["--check"] },
  // Architecture review: drift guard for CHAT_ADAPTER_METADATA vs adapter declarations
  { command: "chat.metadata.drift.validate" },
  // RFC-0390: every command must declare `reads` or `cacheable: false`.
  { command: "command.reads.validate" },
  // RFC-0493: parse-check all .yaml files for syntax errors and duplicate keys.
  { command: "yaml.parse.validate" },
  // RFC-0665: validate workshop-level methodologies config (systems/methodologies.md).
  { command: "methodologies.validate" },
];
