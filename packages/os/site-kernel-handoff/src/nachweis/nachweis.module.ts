/*
<MODULE_CONTRACT>
<purpose>RFC-0707/RFC-0714: Nachweis kernel module — registers 8 nachweis.* commands with lazy-loaded handlers.</purpose>
<keywords>nachweis, module, kernel, commands, registration</keywords>
<responsibilities>
  <item>Registers nachweis.ingest, nachweis.validate, nachweis.manifest.generate, nachweis.consent.update, nachweis.publish, nachweis.withdraw, nachweis.approve, nachweis.public-derivative.</item>
  <item>Uses dynamic imports for lazy loading (same pattern as evidence-module.ts and bordbuch.module.ts).</item>
  <item>Declares correct scopes, flags, reads/writes for each command.</item>
</responsibilities>
<non-goals>
  <item>Does not implement command handlers — those live in nachweis-*.ts files.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0707: initial nachweis kernel module with 6 command registrations.</item>
  <item>RFC-0714: add nachweis.approve and nachweis.public-derivative command registrations.</item>
</CHANGE_SUMMARY>
*/

import type { KernelModule } from "@warpgogol/site-kernel";

export function createNachweisModule(): KernelModule {
  return {
    name: "nachweis",
    version: "0.1.0",
    async register(registry) {
      const { runNachweisIngest } = await import("./nachweis-ingest.ts");
      const { runNachweisValidate } = await import("./nachweis-validate.ts");
      const { runNachweisManifestGenerate } = await import("./nachweis-manifest.ts");
      const { runNachweisConsentUpdate } = await import("./nachweis-consent.ts");
      const { runNachweisPublish } = await import("./nachweis-publish.ts");
      const { runNachweisWithdraw } = await import("./nachweis-withdraw.ts");
      const { runNachweisApprove } = await import("./nachweis-approve.ts");
      const { runNachweisPublicDerivative } = await import("./nachweis-public-derivative.ts");

      registry.registerCommand({
        name: "nachweis.ingest",
        description:
          "RFC-0707: Ingest a PDF evidence document — compute SHA-256, upload to R2, append Bordbuch entry.",
        scope: "workspace",
        supportsAllSites: false,
        mutatesState: true,
        cacheable: false,
        flags: {
          system: { kind: "string", description: "Target system ID" },
          file: { kind: "string", required: true, description: "Path to PDF file to ingest" },
          "record-type": {
            kind: "string",
            required: true,
            description: "Record type (e.g. client-statement, certificate)",
          },
          slug: { kind: "string", required: true, description: "URL-safe slug for the record" },
          "title-de": { kind: "string", required: true, description: "German title" },
          "title-uk": { kind: "string", required: true, description: "Ukrainian title" },
          "title-en": { kind: "string", description: "English title (optional)" },
          "quality-status": { kind: "string", description: "Quality status (default: unverified)" },
          "dry-run": { kind: "boolean", description: "Skip R2 upload and Bordbuch append" },
          json: { kind: "boolean", description: "Output JSON result." },
        },
        reads: [],
        writes: [],
        execute: runNachweisIngest,
      });

      registry.registerCommand({
        name: "nachweis.validate",
        description:
          "RFC-0707: Validate PBP trust entities and enforce publication gate conditions.",
        scope: "workspace",
        supportsAllSites: false,
        mutatesState: false,
        cacheable: false,
        flags: {
          system: { kind: "string", description: "Target system ID" },
          json: { kind: "boolean", description: "Output JSON result." },
        },
        reads: [],
        writes: [],
        execute: runNachweisValidate,
      });

      registry.registerCommand({
        name: "nachweis.manifest.generate",
        description:
          "RFC-0707: Generate public/nachweise/manifest.json from published records (generatedAt: null per RFC-0602).",
        scope: "workspace",
        supportsAllSites: false,
        mutatesState: true,
        cacheable: false,
        flags: {
          system: { kind: "string", description: "Target system ID" },
          json: { kind: "boolean", description: "Output JSON result." },
        },
        reads: [],
        writes: ["<cache>/public/nachweise/manifest.json"],
        execute: runNachweisManifestGenerate,
      });

      registry.registerCommand({
        name: "nachweis.consent.update",
        description:
          "RFC-0707: Update PBP Consent entity status and append nachweis-consent Bordbuch entry.",
        scope: "workspace",
        supportsAllSites: false,
        mutatesState: true,
        cacheable: false,
        flags: {
          system: { kind: "string", description: "Target system ID" },
          "consent-id": { kind: "string", required: true, description: "Consent entity ID (slug)" },
          status: {
            kind: "string",
            required: true,
            description: "New consent status (requested|granted|revoked)",
          },
          method: {
            kind: "string",
            description: "Consent method (verified_business_email|signed_pdf|qes|none)",
          },
          json: { kind: "boolean", description: "Output JSON result." },
        },
        reads: [],
        writes: [],
        execute: runNachweisConsentUpdate,
      });

      registry.registerCommand({
        name: "nachweis.publish",
        description:
          "RFC-0707: Enforce publication gate and transition record to published. Accepts --pilot-n2-exception for N2 pilot.",
        scope: "workspace",
        supportsAllSites: false,
        mutatesState: true,
        cacheable: false,
        flags: {
          system: { kind: "string", description: "Target system ID" },
          slug: { kind: "string", required: true, description: "Record slug to publish" },
          "pilot-n2-exception": {
            kind: "boolean",
            description: "Accept N2 verification level (temporary, removed when N3 implemented)",
          },
          json: { kind: "boolean", description: "Output JSON result." },
        },
        reads: [],
        writes: [],
        execute: runNachweisPublish,
      });

      registry.registerCommand({
        name: "nachweis.withdraw",
        description:
          "RFC-0707: Withdraw a published record — revoke consent, set withdrawn status, regenerate manifest. Idempotent.",
        scope: "workspace",
        supportsAllSites: false,
        mutatesState: true,
        cacheable: false,
        flags: {
          system: { kind: "string", description: "Target system ID" },
          slug: { kind: "string", required: true, description: "Record slug to withdraw" },
          reason: { kind: "string", description: "Withdrawal reason" },
          json: { kind: "boolean", description: "Output JSON result." },
        },
        reads: [],
        writes: [],
        execute: runNachweisWithdraw,
      });

      registry.registerCommand({
        name: "nachweis.approve",
        description:
          "RFC-0714: Record human approval, verification level, and legal content check in a Bordbuch entry. Operator-invoked only.",
        scope: "workspace",
        supportsAllSites: false,
        mutatesState: true,
        cacheable: false,
        flags: {
          system: { kind: "string", description: "Target system ID" },
          slug: { kind: "string", required: true, description: "Record slug to approve" },
          "verification-level": {
            kind: "string",
            required: true,
            description: "Verification level: N0, N1, N2, N3",
          },
          "legal-content-check": {
            kind: "string",
            required: true,
            description: "Legal content check result: passed or failed",
          },
          "dry-run": {
            kind: "boolean",
            description: "Skip Bordbuch write, return what would happen",
          },
          json: { kind: "boolean", description: "Output JSON result." },
        },
        reads: [],
        writes: [],
        execute: runNachweisApprove,
      });

      registry.registerCommand({
        name: "nachweis.public-derivative",
        description:
          "RFC-0714: Upload a public-derivative PDF to R2 and update evidence-source items.public.storage to public. Idempotent by SHA-256.",
        scope: "workspace",
        supportsAllSites: false,
        mutatesState: true,
        cacheable: false,
        flags: {
          system: { kind: "string", description: "Target system ID" },
          slug: {
            kind: "string",
            required: true,
            description: "Record slug to create public derivative for",
          },
          file: {
            kind: "string",
            required: true,
            description: "Path to the public-derivative PDF file",
          },
          "dry-run": { kind: "boolean", description: "Skip R2 upload and entity update" },
          json: { kind: "boolean", description: "Output JSON result." },
        },
        reads: [],
        writes: [],
        execute: runNachweisPublicDerivative,
      });
    },
  };
}
