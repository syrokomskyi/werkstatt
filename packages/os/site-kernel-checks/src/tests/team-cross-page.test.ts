/*
<MODULE_CONTRACT>
<purpose>
RFC-0513: tests for team.cross-page.validate — tests hub visibility/status checks,
navigation consistency, and no-op pass with in-memory filesystem fixtures.
</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0513: initial cross-page validator tests.</item>
</CHANGE_SUMMARY>
*/

import { test, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { runTeamCrossPageValidate } from "../team-cross-page.ts";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelRuntimeContext,
} from "@gogol/site-kernel";

async function writeFile(dir: string, rel: string, content: string): Promise<void> {
  const full = path.join(dir, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, "utf-8");
}

function makeContext(workspaceRoot: string, appDir: string): KernelRuntimeContext {
  return {
    workspaceRoot,
    site: { name: "test-site", directory: appDir },
    commandName: "team.cross-page.validate",
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
pages:
  - pageId: team
    routes:
      de: /team
  - pageId: home
    routes:
      de: /
---
`;

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "team-cross-page-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function getErrorMessages(result: { data?: unknown; exitCode?: number }): string[] {
  const data = result.data as CheckResult;
  return data.diagnostics.filter((d: Diagnostic) => d.severity === "error").map((d) => d.message);
}

test("no-op pass when no people records", async () => {
  await writeFile(tmpDir, "src/content/system.md", SYSTEM_MD);
  const result = await runTeamCrossPageValidate(EMPTY_INPUT, makeContext(tmpDir, tmpDir));
  const data = result.data as CheckResult;
  expect(result.exitCode).toBe(0);
  expect(data.status).toBe("pass");
});

test("no-op pass when no team hub page", async () => {
  await writeFile(
    tmpDir,
    "src/content/system.md",
    `---
cosmicStar: Vega
i18n:
  default: de
  supported:
    de:
      name: Deutsch
      hreflang: de-DE
pages:
  - pageId: home
    routes:
      de: /
---
`,
  );
  await writeFile(
    tmpDir,
    "src/content/people/de/jane.md",
    `---
slug: jane
name: Jane Doe
participantType: human
visibility: public
status: active
page:
  enabled: true
---
`,
  );
  const result = await runTeamCrossPageValidate(EMPTY_INPUT, makeContext(tmpDir, tmpDir));
  const data = result.data as CheckResult;
  expect(result.exitCode).toBe(0);
  expect(data.status).toBe("pass");
});

test("hub visibility error when people block has non-public visibility", async () => {
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
page:
  enabled: true
---
`,
  );
  await writeFile(
    tmpDir,
    "src/content/pages/de/team.md",
    `---
blocks:
  - id: people-humans
    type: people
    props:
      select:
        participantType: human
        status: active
        visibility: private
---
`,
  );
  const result = await runTeamCrossPageValidate(EMPTY_INPUT, makeContext(tmpDir, tmpDir));
  expect(getErrorMessages(result).some((m) => m.includes("[hub-visibility]"))).toBe(true);
});

test("hub status error when people block has non-active status", async () => {
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
page:
  enabled: true
---
`,
  );
  await writeFile(
    tmpDir,
    "src/content/pages/de/team.md",
    `---
blocks:
  - id: people-humans
    type: people
    props:
      select:
        participantType: human
        status: former
        visibility: public
---
`,
  );
  const result = await runTeamCrossPageValidate(EMPTY_INPUT, makeContext(tmpDir, tmpDir));
  expect(getErrorMessages(result).some((m) => m.includes("[hub-status]"))).toBe(true);
});

test("navigation-no-team error when team entry missing", async () => {
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
page:
  enabled: true
---
`,
  );
  await writeFile(
    tmpDir,
    "src/content/pages/de/team.md",
    `---
blocks:
  - id: people-humans
    type: people
    props:
      select:
        participantType: human
        status: active
        visibility: public
---
`,
  );
  await writeFile(
    tmpDir,
    "src/content/navigation/de/navigation.md",
    `---
targets:
  - id: home
    pageId: home
---
`,
  );
  const result = await runTeamCrossPageValidate(EMPTY_INPUT, makeContext(tmpDir, tmpDir));
  expect(getErrorMessages(result).some((m) => m.includes("[navigation-no-team]"))).toBe(true);
});

test("navigation-founder-remnant error when founder entry present", async () => {
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
page:
  enabled: true
---
`,
  );
  await writeFile(
    tmpDir,
    "src/content/pages/de/team.md",
    `---
blocks:
  - id: people-humans
    type: people
    props:
      select:
        participantType: human
        status: active
        visibility: public
---
`,
  );
  await writeFile(
    tmpDir,
    "src/content/navigation/de/navigation.md",
    `---
targets:
  - id: team
    pageId: team
  - id: founder
    pageId: founder
---
`,
  );
  const result = await runTeamCrossPageValidate(EMPTY_INPUT, makeContext(tmpDir, tmpDir));
  expect(getErrorMessages(result).some((m) => m.includes("[navigation-founder-remnant]"))).toBe(
    true,
  );
});

test("passes when hub, navigation, and participants are consistent", async () => {
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
page:
  enabled: true
---
`,
  );
  await writeFile(
    tmpDir,
    "src/content/pages/de/team.md",
    `---
blocks:
  - id: people-humans
    type: people
    props:
      select:
        participantType: human
        status: active
        visibility: public
---
`,
  );
  await writeFile(
    tmpDir,
    "src/content/navigation/de/navigation.md",
    `---
targets:
  - id: team
    pageId: team
---
`,
  );
  const result = await runTeamCrossPageValidate(EMPTY_INPUT, makeContext(tmpDir, tmpDir));
  expect(getErrorMessages(result)).toHaveLength(0);
});
