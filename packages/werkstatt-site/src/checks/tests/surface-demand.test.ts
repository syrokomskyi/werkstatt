import { describe, expect, it } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/site-kernel";
import {
  loadWerkRecords,
  qualifyingWerkRecords,
  runDemandSignalValidate,
  runSurfaceEvidenceJoin,
  runWerkRecordValidate,
} from "../surface-demand.ts";

/*
<MODULE_CONTRACT>
  <purpose>RFC-0280/RFC-0281 regression coverage for demand signals and Werk evidence joins.</purpose>
</MODULE_CONTRACT>
*/

const logger = {
  section() {},
  info() {},
  warn() {},
  error() {},
  success() {},
  getEvents() {
    return [];
  },
};

function input(flags: Record<string, unknown> = {}): KernelCommandInput {
  return { argv: [], flags } as unknown as KernelCommandInput;
}

async function fixture(): Promise<{ root: string; appDir: string; context: KernelRuntimeContext }> {
  const root = await mkdtemp(join(tmpdir(), "surface-demand-"));
  const appDir = join(root, "apps", "demo");
  await mkdir(join(appDir, "src", "content", "surface", "demand-signals", "de"), {
    recursive: true,
  });
  await mkdir(join(appDir, "src", "content", "surface", "werke", "de"), { recursive: true });
  await mkdir(join(appDir, "src"), { recursive: true });
  await writeFile(
    join(appDir, "src", "surface.generated.yaml"),
    `${JSON.stringify(
      {
        entries: [
          {
            surfaceId: "website-local",
            pageId: "website-local:elektriker:deu:bw:stuttgart:wallbox-installation",
            routes: { de: "website/elektriker/deu/bw/stuttgart/wallbox-installation" },
            axes: {
              industry: "elektriker",
              country: "deu",
              region: "bw",
              city: "stuttgart",
              demand: "wallbox-installation",
            },
            depth: 5,
            recordCount: 1,
            indexable: true,
            noindex: false,
          },
        ],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return {
    root,
    appDir,
    context: {
      workspaceRoot: root,
      site: { name: "demo", directory: appDir, toolsDirectory: join(appDir, "tools") },
      dryRun: false,
      logger,
    } as unknown as KernelRuntimeContext,
  };
}

describe("PSEO demand signals and Werk evidence (RFC-0280/RFC-0281)", () => {
  it("validates aggregate demand records and rejects PII-like records", async () => {
    const { root, appDir, context } = await fixture();
    try {
      await writeFile(
        join(appDir, "src", "content", "surface", "demand-signals", "de", "ok.md"),
        `---
id: ok
query: "wallbox elektriker stuttgart"
intent: commercial
axes: { industry: elektriker, country: deu, region: bw, city: stuttgart, demand: wallbox-installation }
volume: 30
source: manual
observedAt: "2026-06-25T00:00:00.000Z"
provenance: { importId: test }
---
`,
        "utf8",
      );
      await writeFile(
        join(appDir, "src", "content", "surface", "demand-signals", "de", "pii.md"),
        `---
id: pii
query: "wallbox elektriker stuttgart"
intent: commercial
axes: { industry: elektriker, city: stuttgart, demand: wallbox-installation }
volume: 30
source: manual
observedAt: "2026-06-25T00:00:00.000Z"
provenance: { importId: test, sourceRef: "userId=abc" }
---
`,
        "utf8",
      );
      const result = await runDemandSignalValidate(input(), context);
      expect(result.exitCode).toBe(1);
      const ruleIds = result.data?.diagnostics.map((diagnostic) => diagnostic.ruleId) ?? [];
      expect(ruleIds).toContain("DEM-05");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("joins only consented Werk records to matching tuples", async () => {
    const { root, appDir, context } = await fixture();
    try {
      await writeFile(
        join(appDir, "src", "content", "surface", "werke", "de", "ok.md"),
        `---
id: werk-ok
title: "Wallbox Projekt"
axes:
  industry: [elektriker]
  country: deu
  region: bw
  city: stuttgart
  demand: [wallbox-installation]
facts: { scope: "Projekt", outcome: "Live" }
provenance: { sourceRef: test, anchoredHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
consent: { publishable: true, clientApproved: true }
---
`,
        "utf8",
      );
      await writeFile(
        join(appDir, "src", "content", "surface", "werke", "de", "private.md"),
        `---
id: werk-private
title: "Private Wallbox"
axes:
  industry: [elektriker]
  city: stuttgart
  demand: [wallbox-installation]
facts: { scope: "Projekt" }
provenance: { sourceRef: test, anchoredHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }
consent: { publishable: false, clientApproved: false }
---
`,
        "utf8",
      );
      expect((await runWerkRecordValidate(input(), context)).exitCode).toBe(0);
      const works = await loadWerkRecords(appDir, "de");
      const matching = qualifyingWerkRecords(works, {
        surfaceId: "website-local",
        pageId: "website-local:elektriker:deu:bw:stuttgart:wallbox-installation",
        routes: { de: "x" },
        axes: {
          industry: "elektriker",
          country: "deu",
          region: "bw",
          city: "stuttgart",
          demand: "wallbox-installation",
        },
        depth: 5,
        recordCount: 1,
        indexable: true,
        noindex: false,
      });
      expect(matching.map((work) => work.id)).toEqual(["werk-ok"]);
      const joinResult = await runSurfaceEvidenceJoin(
        input({ blueprint: "website-local" }),
        context,
      );
      expect(joinResult.exitCode).toBe(0);
      expect(joinResult.summary).toContain("1 joined tuple");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
