/*
<MODULE_CONTRACT>
<purpose>
RFC-0513: tests for team.lifecycle.validate — tests status transitions, CTA removal,
visibility rules, and review cadence warnings with in-memory filesystem fixtures.
</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0513: initial lifecycle validator tests.</item>
</CHANGE_SUMMARY>
*/

import { test, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { runTeamLifecycleValidate } from "../team-lifecycle.ts";
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
    commandName: "team.lifecycle.validate",
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

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "team-lifecycle-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function getErrorMessages(result: { data?: unknown; exitCode?: number }): string[] {
  const data = result.data as CheckResult;
  return data.diagnostics.filter((d: Diagnostic) => d.severity === "error").map((d) => d.message);
}

function getWarningMessages(result: { data?: unknown; exitCode?: number }): string[] {
  const data = result.data as CheckResult;
  return data.diagnostics.filter((d: Diagnostic) => d.severity === "warning").map((d) => d.message);
}

test("no-op pass when no people records", async () => {
  await writeFile(tmpDir, "src/content/system.md", SYSTEM_MD);
  const ctx = makeContext(tmpDir, tmpDir);
  const result = await runTeamLifecycleValidate(EMPTY_INPUT, ctx);
  const data = result.data as CheckResult;
  expect(result.exitCode).toBe(0);
  expect(data.status).toBe("pass");
});

test("active participant with CTA passes", async () => {
  await writeFile(tmpDir, "src/content/system.md", SYSTEM_MD);
  await writeFile(
    tmpDir,
    "src/content/people/de/jane.md",
    `---
slug: jane
name: Jane Doe
participantType: human
visibility: public
status: active
cta:
  label: Kontakt
  target: /kontakt/
---
`,
  );
  const ctx = makeContext(tmpDir, tmpDir);
  const result = await runTeamLifecycleValidate(EMPTY_INPUT, ctx);
  expect(result.exitCode).toBe(0);
  expect(getErrorMessages(result)).toHaveLength(0);
});

test("cta-on-former error for former participant with CTA", async () => {
  await writeFile(tmpDir, "src/content/system.md", SYSTEM_MD);
  await writeFile(
    tmpDir,
    "src/content/people/de/jane.md",
    `---
slug: jane
name: Jane Doe
participantType: human
visibility: public
status: former
cta:
  label: Kontakt
  target: /kontakt/
---
`,
  );
  const ctx = makeContext(tmpDir, tmpDir);
  const result = await runTeamLifecycleValidate(EMPTY_INPUT, ctx);
  expect(result.exitCode).toBe(1);
  expect(getErrorMessages(result).some((m) => m.includes("[cta-on-former]"))).toBe(true);
});

test("cta-on-former error for retired participant with CTA", async () => {
  await writeFile(tmpDir, "src/content/system.md", SYSTEM_MD);
  await writeFile(
    tmpDir,
    "src/content/people/de/jane.md",
    `---
slug: jane
name: Jane Doe
participantType: human
visibility: public
status: retired
cta:
  label: Kontakt
  target: /kontakt/
---
`,
  );
  const ctx = makeContext(tmpDir, tmpDir);
  const result = await runTeamLifecycleValidate(EMPTY_INPUT, ctx);
  expect(result.exitCode).toBe(1);
  expect(getErrorMessages(result).some((m) => m.includes("[cta-on-former]"))).toBe(true);
});

test("public-draft error for draft participant with public visibility", async () => {
  await writeFile(tmpDir, "src/content/system.md", SYSTEM_MD);
  await writeFile(
    tmpDir,
    "src/content/people/de/jane.md",
    `---
slug: jane
name: Jane Doe
participantType: human
visibility: public
status: draft
---
`,
  );
  const ctx = makeContext(tmpDir, tmpDir);
  const result = await runTeamLifecycleValidate(EMPTY_INPUT, ctx);
  expect(result.exitCode).toBe(1);
  expect(getErrorMessages(result).some((m) => m.includes("[public-draft]"))).toBe(true);
});

test("public-suspended error for suspended participant with public visibility", async () => {
  await writeFile(tmpDir, "src/content/system.md", SYSTEM_MD);
  await writeFile(
    tmpDir,
    "src/content/people/de/jane.md",
    `---
slug: jane
name: Jane Doe
participantType: human
visibility: public
status: suspended
---
`,
  );
  const ctx = makeContext(tmpDir, tmpDir);
  const result = await runTeamLifecycleValidate(EMPTY_INPUT, ctx);
  expect(result.exitCode).toBe(1);
  expect(getErrorMessages(result).some((m) => m.includes("[public-suspended]"))).toBe(true);
});

test("consent-review-due warning for stale consent", async () => {
  const oldDate = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  await writeFile(tmpDir, "src/content/system.md", SYSTEM_MD);
  await writeFile(
    tmpDir,
    "src/content/people/de/jane.md",
    `---
slug: jane
name: Jane Doe
participantType: human
visibility: public
status: active
consent:
  consentRecordId: rec-001
  approvedFields:
    - location
  consentDate: ${oldDate}
  profileReviewer: admin
---
`,
  );
  const ctx = makeContext(tmpDir, tmpDir);
  const result = await runTeamLifecycleValidate(EMPTY_INPUT, ctx);
  expect(getWarningMessages(result).some((m) => m.includes("[consent-review-due]"))).toBe(true);
});

test("stale-technical-evaluation warning for AI-agent", async () => {
  const oldDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  await writeFile(tmpDir, "src/content/system.md", SYSTEM_MD);
  await writeFile(
    tmpDir,
    "src/content/people/de/ki.md",
    `---
slug: ki-assistent
publicName: KI-Assistent
participantType: ai-agent
visibility: public
status: active
aiAgent:
  purposeStatement: "Hilft bei Content."
  autonomyLevel: A2
  accountableHumanId: jane
  technicalStand:
    lastEvaluatedAt: ${oldDate}
---
`,
  );
  const ctx = makeContext(tmpDir, tmpDir);
  const result = await runTeamLifecycleValidate(EMPTY_INPUT, ctx);
  expect(getWarningMessages(result).some((m) => m.includes("[stale-technical-evaluation]"))).toBe(
    true,
  );
});

test("next-review-past warning", async () => {
  const pastDate = "2020-01-01";
  await writeFile(tmpDir, "src/content/system.md", SYSTEM_MD);
  await writeFile(
    tmpDir,
    "src/content/people/de/jane.md",
    `---
slug: jane
name: Jane Doe
participantType: human
visibility: public
status: active
nextReviewAt: ${pastDate}
---
`,
  );
  const ctx = makeContext(tmpDir, tmpDir);
  const result = await runTeamLifecycleValidate(EMPTY_INPUT, ctx);
  expect(getWarningMessages(result).some((m) => m.includes("[next-review-past]"))).toBe(true);
});
