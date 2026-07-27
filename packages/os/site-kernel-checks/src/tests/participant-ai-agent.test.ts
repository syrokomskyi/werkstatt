/*
<MODULE_CONTRACT>
<purpose>
RFC-0511: tests for participant-ai-agent-validate — tests accountableHumanId
resolution, autonomyLevel enum, purposeStatement, prose file presence, and
no-op pass with in-memory filesystem fixtures.
</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0511: initial AI-agent profile validator tests.</item>
</CHANGE_SUMMARY>
*/

import { test, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { runParticipantAiAgentValidate } from "../participant-ai-agent.ts";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";

async function writeFile(dir: string, rel: string, content: string): Promise<void> {
  const full = path.join(dir, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, "utf-8");
}

function makeContext(workspaceRoot: string, appDir: string): KernelRuntimeContext {
  return {
    workspaceRoot,
    site: { name: "test-site", directory: appDir },
    commandName: "participant.ai-agent.validate",
    args: {},
    flags: {},
  } as unknown as KernelRuntimeContext;
}

const EMPTY_INPUT: KernelCommandInput = { args: {}, flags: {} } as unknown as KernelCommandInput;

const SYSTEM_MD = `---
cosmicStar: Vega
i18n:
  default: de
  supported:
    de:
      name: Deutsch
      hreflang: de-DE
---
`;

const HUMAN_PEOPLE_DE = `---
slug: jane-doe
name: Jane Doe
participantType: human
visibility: public
status: active
page:
  enabled: true
---
`;

const AI_AGENT_PEOPLE_DE = `---
slug: ki-assistent
publicName: KI-Assistent
participantType: ai-agent
visibility: public
status: active
page:
  enabled: true
capabilities:
  - Textgenerierung
  - Code-Review
aiAgent:
  purposeStatement: "Unterstützt das Team bei der Content-Erstellung."
  autonomyLevel: A2
  accountableHumanId: jane-doe
  technicalStand:
    modelFamily: "gpt-4o"
    lastEvaluatedAt: "2026-07-01"
  knownLimitations:
    - "Keine autonomen Vertragsabschlüsse"
---
`;

const PROSE_RECHTE = `## Autonomie\n\nA2: Autonome Ausführung mit Freigabe.\n`;
const PROSE_VERANTWORTLICHKEIT = `## Verantwortlich\n\nJane Doe.\n`;
const PROSE_TECHNIK = `## Modell\n\nGPT-4o.\n`;

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-agent-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

test("no-op pass when no people records exist", async () => {
  await writeFile(tmpDir, "src/content/system.md", SYSTEM_MD);
  const result = await runParticipantAiAgentValidate(EMPTY_INPUT, makeContext(tmpDir, tmpDir));
  const data = result.data as CheckResult;
  expect(result.exitCode).toBe(0);
  expect(data.status).toBe("pass");
});

test("no-op pass when no AI-agent participants exist", async () => {
  await writeFile(tmpDir, "src/content/system.md", SYSTEM_MD);
  await writeFile(tmpDir, "src/content/people/de/jane-doe.md", HUMAN_PEOPLE_DE);
  const result = await runParticipantAiAgentValidate(EMPTY_INPUT, makeContext(tmpDir, tmpDir));
  const data = result.data as CheckResult;
  expect(result.exitCode).toBe(0);
  expect(data.status).toBe("pass");
});

test("passes with valid AI-agent participant and prose files", async () => {
  await writeFile(tmpDir, "src/content/system.md", SYSTEM_MD);
  await writeFile(tmpDir, "src/content/people/de/jane-doe.md", HUMAN_PEOPLE_DE);
  await writeFile(tmpDir, "src/content/people/de/ki-assistent.md", AI_AGENT_PEOPLE_DE);
  await writeFile(tmpDir, "src/content/prose/de/ki-assistent-rechte.md", PROSE_RECHTE);
  await writeFile(
    tmpDir,
    "src/content/prose/de/ki-assistent-verantwortlichkeit.md",
    PROSE_VERANTWORTLICHKEIT,
  );
  await writeFile(tmpDir, "src/content/prose/de/ki-assistent-technik.md", PROSE_TECHNIK);
  const result = await runParticipantAiAgentValidate(EMPTY_INPUT, makeContext(tmpDir, tmpDir));
  const data = result.data as CheckResult;
  expect(result.exitCode).toBe(0);
  expect(data.status).toBe("pass");
});

test("fails when accountableHumanId is missing", async () => {
  await writeFile(tmpDir, "src/content/system.md", SYSTEM_MD);
  const agent = AI_AGENT_PEOPLE_DE.replace("accountableHumanId: jane-doe", "");
  await writeFile(tmpDir, "src/content/people/de/ki-assistent.md", agent);
  await writeFile(tmpDir, "src/content/prose/de/ki-assistent-rechte.md", PROSE_RECHTE);
  await writeFile(
    tmpDir,
    "src/content/prose/de/ki-assistent-verantwortlichkeit.md",
    PROSE_VERANTWORTLICHKEIT,
  );
  await writeFile(tmpDir, "src/content/prose/de/ki-assistent-technik.md", PROSE_TECHNIK);
  const result = await runParticipantAiAgentValidate(EMPTY_INPUT, makeContext(tmpDir, tmpDir));
  const data = result.data as CheckResult;
  expect(result.exitCode).toBe(1);
  expect(data.summary.error).toBeGreaterThan(0);
  const msgs = data.diagnostics.map((d: Diagnostic) => d.message);
  expect(msgs.some((m) => m.includes("ai-agent-missing-accountable-human"))).toBe(true);
});

test("fails when accountableHumanId does not resolve", async () => {
  await writeFile(tmpDir, "src/content/system.md", SYSTEM_MD);
  const agent = AI_AGENT_PEOPLE_DE.replace(
    "accountableHumanId: jane-doe",
    "accountableHumanId: nobody",
  );
  await writeFile(tmpDir, "src/content/people/de/ki-assistent.md", agent);
  await writeFile(tmpDir, "src/content/prose/de/ki-assistent-rechte.md", PROSE_RECHTE);
  await writeFile(
    tmpDir,
    "src/content/prose/de/ki-assistent-verantwortlichkeit.md",
    PROSE_VERANTWORTLICHKEIT,
  );
  await writeFile(tmpDir, "src/content/prose/de/ki-assistent-technik.md", PROSE_TECHNIK);
  const result = await runParticipantAiAgentValidate(EMPTY_INPUT, makeContext(tmpDir, tmpDir));
  const data = result.data as CheckResult;
  expect(result.exitCode).toBe(1);
  const msgs = data.diagnostics.map((d: Diagnostic) => d.message);
  expect(msgs.some((m) => m.includes("ai-agent-unresolved-accountable-human"))).toBe(true);
});

test("fails when autonomyLevel is invalid", async () => {
  await writeFile(tmpDir, "src/content/system.md", SYSTEM_MD);
  await writeFile(tmpDir, "src/content/people/de/jane-doe.md", HUMAN_PEOPLE_DE);
  const agent = AI_AGENT_PEOPLE_DE.replace("autonomyLevel: A2", "autonomyLevel: X9");
  await writeFile(tmpDir, "src/content/people/de/ki-assistent.md", agent);
  await writeFile(tmpDir, "src/content/prose/de/ki-assistent-rechte.md", PROSE_RECHTE);
  await writeFile(
    tmpDir,
    "src/content/prose/de/ki-assistent-verantwortlichkeit.md",
    PROSE_VERANTWORTLICHKEIT,
  );
  await writeFile(tmpDir, "src/content/prose/de/ki-assistent-technik.md", PROSE_TECHNIK);
  const result = await runParticipantAiAgentValidate(EMPTY_INPUT, makeContext(tmpDir, tmpDir));
  const data = result.data as CheckResult;
  expect(result.exitCode).toBe(1);
  const msgs = data.diagnostics.map((d: Diagnostic) => d.message);
  expect(msgs.some((m) => m.includes("ai-agent-invalid-autonomy"))).toBe(true);
});

test("fails when purposeStatement is empty", async () => {
  await writeFile(tmpDir, "src/content/system.md", SYSTEM_MD);
  await writeFile(tmpDir, "src/content/people/de/jane-doe.md", HUMAN_PEOPLE_DE);
  const agent = AI_AGENT_PEOPLE_DE.replace(
    'purposeStatement: "Unterstützt das Team bei der Content-Erstellung."',
    'purposeStatement: ""',
  );
  await writeFile(tmpDir, "src/content/people/de/ki-assistent.md", agent);
  await writeFile(tmpDir, "src/content/prose/de/ki-assistent-rechte.md", PROSE_RECHTE);
  await writeFile(
    tmpDir,
    "src/content/prose/de/ki-assistent-verantwortlichkeit.md",
    PROSE_VERANTWORTLICHKEIT,
  );
  await writeFile(tmpDir, "src/content/prose/de/ki-assistent-technik.md", PROSE_TECHNIK);
  const result = await runParticipantAiAgentValidate(EMPTY_INPUT, makeContext(tmpDir, tmpDir));
  const data = result.data as CheckResult;
  expect(result.exitCode).toBe(1);
  const msgs = data.diagnostics.map((d: Diagnostic) => d.message);
  expect(msgs.some((m) => m.includes("ai-agent-empty-purpose"))).toBe(true);
});

test("fails when required prose file is missing", async () => {
  await writeFile(tmpDir, "src/content/system.md", SYSTEM_MD);
  await writeFile(tmpDir, "src/content/people/de/jane-doe.md", HUMAN_PEOPLE_DE);
  await writeFile(tmpDir, "src/content/people/de/ki-assistent.md", AI_AGENT_PEOPLE_DE);
  await writeFile(tmpDir, "src/content/prose/de/ki-assistent-rechte.md", PROSE_RECHTE);
  await writeFile(
    tmpDir,
    "src/content/prose/de/ki-assistent-verantwortlichkeit.md",
    PROSE_VERANTWORTLICHKEIT,
  );
  // technik prose file intentionally missing
  const result = await runParticipantAiAgentValidate(EMPTY_INPUT, makeContext(tmpDir, tmpDir));
  const data = result.data as CheckResult;
  expect(result.exitCode).toBe(1);
  const msgs = data.diagnostics.map((d: Diagnostic) => d.message);
  expect(msgs.some((m) => m.includes("ai-agent-missing-prose") && m.includes("technik"))).toBe(
    true,
  );
});

test("warns when lastEvaluatedAt is older than 6 months", async () => {
  await writeFile(tmpDir, "src/content/system.md", SYSTEM_MD);
  await writeFile(tmpDir, "src/content/people/de/jane-doe.md", HUMAN_PEOPLE_DE);
  const agent = AI_AGENT_PEOPLE_DE.replace(
    'lastEvaluatedAt: "2026-07-01"',
    'lastEvaluatedAt: "2025-01-01"',
  );
  await writeFile(tmpDir, "src/content/people/de/ki-assistent.md", agent);
  await writeFile(tmpDir, "src/content/prose/de/ki-assistent-rechte.md", PROSE_RECHTE);
  await writeFile(
    tmpDir,
    "src/content/prose/de/ki-assistent-verantwortlichkeit.md",
    PROSE_VERANTWORTLICHKEIT,
  );
  await writeFile(tmpDir, "src/content/prose/de/ki-assistent-technik.md", PROSE_TECHNIK);
  const result = await runParticipantAiAgentValidate(EMPTY_INPUT, makeContext(tmpDir, tmpDir));
  const data = result.data as CheckResult;
  expect(result.exitCode).toBe(0);
  expect(data.summary.warning).toBeGreaterThan(0);
  const warns = data.diagnostics
    .filter((d: Diagnostic) => d.severity === "warning")
    .map((d: Diagnostic) => d.message);
  expect(warns.some((m) => m.includes("ai-agent-stale-evaluation"))).toBe(true);
});
