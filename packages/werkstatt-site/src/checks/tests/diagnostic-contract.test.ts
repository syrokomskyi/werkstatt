/*
<MODULE_CONTRACT>
<purpose>RFC-0852: Cross-package consumption and no-alias regression tests for the site plugin.</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0852: initial contract test proving the site imports engine-owned diagnostic schemas and no legacy aliases remain.</item>
</CHANGE_SUMMARY>
*/

import { test, expect } from "vitest";
import {
  diagnosticSchema,
  diagnosticSeveritySchema,
  diagnosticEvidenceSchema,
} from "@warpgogol/werkstatt/schemas";
import type {
  Diagnostic,
  DiagnosticSeverity,
  DiagnosticEvidence,
} from "@warpgogol/werkstatt/schemas";
import {
  diagnosticSchema as siteDiagnosticSchema,
  diagnosticSeveritySchema as siteDiagnosticSeveritySchema,
  diagnosticEvidenceSchema as siteDiagnosticEvidenceSchema,
} from "../audit/types.ts";
import type {
  Diagnostic as SiteDiagnostic,
  DiagnosticSeverity as SiteDiagnosticSeverity,
  DiagnosticEvidence as SiteDiagnosticEvidence,
} from "../audit/types.ts";

// ---------------------------------------------------------------------------
// Cross-package identity: site re-exports are the same engine schemas
// ---------------------------------------------------------------------------

test("site diagnosticSchema is the engine diagnosticSchema", () => {
  expect(siteDiagnosticSchema).toBe(diagnosticSchema);
});

test("site diagnosticSeveritySchema is the engine diagnosticSeveritySchema", () => {
  expect(siteDiagnosticSeveritySchema).toBe(diagnosticSeveritySchema);
});

test("site diagnosticEvidenceSchema is the engine diagnosticEvidenceSchema", () => {
  expect(siteDiagnosticEvidenceSchema).toBe(diagnosticEvidenceSchema);
});

// ---------------------------------------------------------------------------
// Type identity: site types are the engine types
// ---------------------------------------------------------------------------

test("site Diagnostic type is structurally identical to engine Diagnostic", () => {
  const d: SiteDiagnostic = {
    ruleId: "TEST-01",
    severity: "error",
    message: "Test message",
  };
  const engine: Diagnostic = d;
  expect(engine.ruleId).toBe("TEST-01");
});

test("site DiagnosticSeverity type is structurally identical to engine DiagnosticSeverity", () => {
  const sev: SiteDiagnosticSeverity = "error";
  const engine: DiagnosticSeverity = sev;
  expect(engine).toBe("error");
});

test("site DiagnosticEvidence type is structurally identical to engine DiagnosticEvidence", () => {
  const ev: SiteDiagnosticEvidence = { kind: "rule" };
  const engine: DiagnosticEvidence = ev;
  expect(engine.kind).toBe("rule");
});

// ---------------------------------------------------------------------------
// No legacy aliases: audit/types.ts must not export removed symbols
// ---------------------------------------------------------------------------

test("audit/types.ts does not export auditSeveritySchema", async () => {
  const mod = (await import("../audit/types.ts")) as Record<string, unknown>;
  expect(mod.auditSeveritySchema).toBeUndefined();
});

test("audit/types.ts does not export auditEvidenceSchema", async () => {
  const mod = (await import("../audit/types.ts")) as Record<string, unknown>;
  expect(mod.auditEvidenceSchema).toBeUndefined();
});

test("audit/types.ts does not export auditFindingSchema", async () => {
  const mod = (await import("../audit/types.ts")) as Record<string, unknown>;
  expect(mod.auditFindingSchema).toBeUndefined();
});

test("audit/types.ts does not export AuditFinding type alias", async () => {
  const mod = (await import("../audit/types.ts")) as Record<string, unknown>;
  expect(mod.AuditFinding).toBeUndefined();
});

// ---------------------------------------------------------------------------
// No legacy fields: diagnosticSchema rejects id, blockId, suggestion
// ---------------------------------------------------------------------------

test("diagnosticSchema rejects id field", () => {
  const result = diagnosticSchema.safeParse({
    ruleId: "TEST-01",
    severity: "error",
    message: "Test",
    id: "f-001",
  });
  expect(result.success).toBe(false);
});

test("diagnosticSchema rejects blockId field", () => {
  const result = diagnosticSchema.safeParse({
    ruleId: "TEST-01",
    severity: "error",
    message: "Test",
    blockId: "hero",
  });
  expect(result.success).toBe(false);
});

test("diagnosticSchema rejects suggestion field", () => {
  const result = diagnosticSchema.safeParse({
    ruleId: "TEST-01",
    severity: "error",
    message: "Test",
    suggestion: "Fix it",
  });
  expect(result.success).toBe(false);
});

// ---------------------------------------------------------------------------
// Engine import boundary: site imports from engine, not vice versa
// ---------------------------------------------------------------------------

test("engine diagnosticSchema is importable from @warpgogol/werkstatt/schemas", () => {
  expect(typeof diagnosticSchema).toBe("object");
  expect(typeof diagnosticSchema.safeParse).toBe("function");
});
