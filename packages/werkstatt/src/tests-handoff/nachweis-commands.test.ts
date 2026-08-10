/*
<MODULE_CONTRACT>
  <purpose>
    Unit tests for nachweis command handlers (RFC-0707, RFC-0714, RFC-0715).
    Tests cover entitlement skip, dry-run, validation, manifest generation, consent update, publish gate, withdraw, resolveDefaultLang error paths, and consent c.id fallback matching.
  </purpose>
  <keywords>RFC-0707, RFC-0714, RFC-0715, nachweis, unit-test, entitlement, dry-run, gate, consent, resolveDefaultLang</keywords>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0707: initial nachweis unit tests.</item>
  <item>RFC-0715: add resolveDefaultLang error path tests and consent c.id fallback test (fo-fix F-2, F-3).</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  KernelCommandInput,
  KernelRuntimeContext,
  KernelFlagValue,
} from "@warpgogol/werkstatt/kernel";
import { createDefaultIO, createKernelLogger } from "@warpgogol/werkstatt/kernel";
import { expectData } from "./helpers/kernel-result-helpers.ts";

// ── Mock state ──────────────────────────────────────────────────────────────

const mockR2State = vi.hoisted(() => ({
  objects: new Map<string, Uint8Array>(),
  putCalls: 0,
  putShouldFail: false as string | false,
}));

vi.mock("../evidence/r2-client.ts", () => ({
  MissingEnvError: class MissingEnvError extends Error {
    diagnostic = "MISSING_ENV";
    missingVar: string;
    constructor(v: string) {
      super(`${v} environment variable is required`);
      this.missingVar = v;
    }
  },
  resolveR2ConfigFromEnv: vi.fn(() => ({
    accountId: "test-account",
    accessKeyId: "test-key",
    secretAccessKey: "test-secret",
    bucketName: "nachweise",
  })),
  createR2Client: vi.fn(() => ({
    putObject: vi.fn(async (input: { key: string; body: Uint8Array }) => {
      if (mockR2State.putShouldFail) {
        throw new Error(mockR2State.putShouldFail);
      }
      mockR2State.objects.set(input.key, input.body);
      mockR2State.putCalls++;
    }),
  })),
}));

// Mock resolveCacheClonePath to avoid needing system-config.yaml
vi.mock("../sternsystem/registry-io.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../sternsystem/registry-io.ts")>();
  return {
    ...actual,
    resolveCacheClonePath: vi.fn((workspaceRoot: string, systemId: string) => {
      return join(workspaceRoot, "systems-cache", systemId);
    }),
  };
});

// Mock executeKernelCommand for bordbuch.validate delegation
vi.mock("@warpgogol/werkstatt/kernel", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@warpgogol/werkstatt/kernel")>();
  return {
    ...actual,
    executeKernelCommand: vi.fn(async () => ({
      commandName: "bordbuch.validate",
      exitCode: 0,
      data: { entries: 0, violations: [] },
      summary: "bordbuch.validate: 0 entries, 0 violations",
    })),
  };
});

// ── Helpers ─────────────────────────────────────────────────────────────────

let tmpDir: string;
let workspaceRoot: string;

function makeContext(siteName?: string): KernelRuntimeContext {
  const logger = createKernelLogger();
  const { io } = createDefaultIO();
  return {
    workspaceRoot,
    logger,
    io,
    fileIntents: [],
    commandName: "test",
    ...(siteName ? { site: { name: siteName } } : {}),
  } as unknown as KernelRuntimeContext;
}

function makeInput(flags: Record<string, KernelFlagValue>): KernelCommandInput {
  return {
    flags,
    argv: [],
  };
}

async function writeSystemManifest(cachePath: string): Promise<void> {
  const contentDir = join(cachePath, "src", "content");
  await mkdir(contentDir, { recursive: true });
  await writeFile(
    join(contentDir, "system.md"),
    "---\ni18n:\n  default: de\n  languages:\n    - de\n---\n",
  );
}

async function writeEntitlements(cachePath: string, features: string[]): Promise<void> {
  const dir = join(cachePath, "src");
  await mkdir(dir, { recursive: true });
  const { stringify: yamlStringify } = await import("yaml");
  await writeFile(join(dir, "entitlements.generated.yaml"), yamlStringify({ features }));
  // Write minimal system.md for resolveDefaultLang (RFC-0715: lang from system.md i18n.default)
  await writeSystemManifest(cachePath);
}

async function _writeBordbuch(cachePath: string, entries: unknown[]): Promise<void> {
  const dir = join(cachePath, "bordbuch");
  await mkdir(dir, { recursive: true });
  const lines = entries.map((e) => JSON.stringify(e)).join("\n") + (entries.length > 0 ? "\n" : "");
  await writeFile(join(dir, "events.ndjson"), lines);
}

const PBP_ENTITY_DIR_MAP: Record<string, string> = {
  "evidence-source": "trust/evidence",
  consent: "trust/consents",
  claim: "trust/claims",
};

async function writePbpEntity(
  cachePath: string,
  entityType: string,
  slug: string,
  data: Record<string, unknown>,
): Promise<void> {
  const subDir = PBP_ENTITY_DIR_MAP[entityType] ?? entityType;
  const dir = join(cachePath, "src", "content", "business-profile", "de", subDir);
  await mkdir(dir, { recursive: true });
  const frontmatter = Object.entries(data)
    .map(([k, v]) => `${k}: ${typeof v === "string" ? JSON.stringify(v) : JSON.stringify(v)}`)
    .join("\n");
  await writeFile(join(dir, `${slug}.md`), `---\n${frontmatter}\n---\n\nContent\n`);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("RFC-0707: nachweis.ingest", () => {
  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "nachweis-test-XXXX-"));
    workspaceRoot = tmpDir;
    mockR2State.objects.clear();
    mockR2State.putCalls = 0;
    mockR2State.putShouldFail = false;
    // Write minimal package.json for resolveCurrentEcosystem
    await writeFile(join(tmpDir, "package.json"), JSON.stringify({ version: "1.0.0" }) + "\n");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("skips silently when nachweis entitlement is not resolved", async () => {
    const { runNachweisIngest } = await import("../nachweis/nachweis-ingest.ts");
    const result = await runNachweisIngest(
      makeInput({
        system: "test-sys",
        file: "/fake.pdf",
        "record-type": "certificate",
        slug: "test-record",
        "title-de": "Test",
        "title-uk": "Тест",
      }),
      makeContext("test-sys"),
    );
    expect(result.exitCode).toBe(0);
    expect(result.summary).toContain("skipped");
  });

  it("fails on non-PDF file", async () => {
    const cachePath = join(tmpDir, "systems-cache", "test-sys");
    await mkdir(cachePath, { recursive: true });
    await writeEntitlements(cachePath, ["nachweis"]);

    const nonPdf = join(tmpDir, "test.txt");
    await writeFile(nonPdf, "not a pdf");

    const { runNachweisIngest } = await import("../nachweis/nachweis-ingest.ts");
    await expect(
      runNachweisIngest(
        makeInput({
          system: "test-sys",
          file: nonPdf,
          "record-type": "certificate",
          slug: "test-record",
          "title-de": "Test",
          "title-uk": "Тест",
        }),
        makeContext("test-sys"),
      ),
    ).rejects.toThrow("INVALID_FILE");
  });

  it("fails on missing file", async () => {
    const cachePath = join(tmpDir, "systems-cache", "test-sys");
    await mkdir(cachePath, { recursive: true });
    await writeEntitlements(cachePath, ["nachweis"]);

    const { runNachweisIngest } = await import("../nachweis/nachweis-ingest.ts");
    await expect(
      runNachweisIngest(
        makeInput({
          system: "test-sys",
          file: "/nonexistent.pdf",
          "record-type": "certificate",
          slug: "test-record",
          "title-de": "Test",
          "title-uk": "Тест",
        }),
        makeContext("test-sys"),
      ),
    ).rejects.toThrow("NOT_FOUND");
  });

  it("dry-run computes hash without uploading or appending bordbuch", async () => {
    const cachePath = join(tmpDir, "systems-cache", "test-sys");
    await mkdir(cachePath, { recursive: true });
    await writeEntitlements(cachePath, ["nachweis"]);

    const pdfContent = "fake pdf content for testing";
    const pdfFile = join(tmpDir, "test.pdf");
    await writeFile(pdfFile, pdfContent);

    const { runNachweisIngest } = await import("../nachweis/nachweis-ingest.ts");
    const result = await runNachweisIngest(
      makeInput({
        system: "test-sys",
        file: pdfFile,
        "record-type": "certificate",
        slug: "test-record",
        "title-de": "Test",
        "title-uk": "Тест",
        "dry-run": true,
      }),
      makeContext("test-sys"),
    );

    expect(result.exitCode).toBe(0);
    expect(expectData(result).dryRun).toBe(true);
    expect(expectData(result).bordbuchEventId).toBeNull();
    expect(mockR2State.putCalls).toBe(0);
    expect(expectData(result).sourceSha256).toMatch(/^sha256:/);
  });

  it("uploads to R2 and appends bordbuch on success", async () => {
    const cachePath = join(tmpDir, "systems-cache", "test-sys");
    await mkdir(cachePath, { recursive: true });
    await writeEntitlements(cachePath, ["nachweis"]);

    const pdfContent = "fake pdf content for testing real upload";
    const pdfFile = join(tmpDir, "test.pdf");
    await writeFile(pdfFile, pdfContent);

    const { runNachweisIngest } = await import("../nachweis/nachweis-ingest.ts");
    const result = await runNachweisIngest(
      makeInput({
        system: "test-sys",
        file: pdfFile,
        "record-type": "certificate",
        slug: "test-record",
        "title-de": "Test",
        "title-uk": "Тест",
      }),
      makeContext("test-sys"),
    );

    expect(result.exitCode).toBe(0);
    expect(expectData(result).dryRun).toBe(false);
    expect(mockR2State.putCalls).toBe(1);
    expect(expectData(result).r2Path).toContain("test-sys/private/");
    expect(expectData(result).bordbuchEventId).toBeTruthy();
  });
});

describe("RFC-0707: nachweis.manifest.generate", () => {
  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "nachweis-manifest-XXXX-"));
    workspaceRoot = tmpDir;
    await writeFile(join(tmpDir, "package.json"), JSON.stringify({ version: "1.0.0" }) + "\n");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("skips silently when nachweis entitlement is not resolved", async () => {
    const { runNachweisManifestGenerate } = await import("../nachweis/nachweis-manifest.ts");
    const result = await runNachweisManifestGenerate(
      makeInput({ system: "test-sys" }),
      makeContext("test-sys"),
    );
    expect(result.exitCode).toBe(0);
    expect(result.summary).toContain("skipped");
  });

  it("writes empty manifest when no published records exist", async () => {
    const cachePath = join(tmpDir, "systems-cache", "test-sys");
    await mkdir(cachePath, { recursive: true });
    await writeEntitlements(cachePath, ["nachweis"]);

    const { runNachweisManifestGenerate } = await import("../nachweis/nachweis-manifest.ts");
    const result = await runNachweisManifestGenerate(
      makeInput({ system: "test-sys" }),
      makeContext("test-sys"),
    );

    expect(result.exitCode).toBe(0);
    expect(expectData(result).records).toEqual([]);
    expect(expectData(result).generatedAt).toBeNull();
    expect(expectData(result).expiresAt).toBeNull();

    const manifestPath = join(cachePath, "public", "nachweise", "manifest.json");
    expect(existsSync(manifestPath)).toBe(true);
    const content = JSON.parse(await readFile(manifestPath, "utf8"));
    expect(content.records).toEqual([]);
    expect(content.generatedAt).toBeNull();
  });

  it("includes only publication.visibility: public records", async () => {
    const cachePath = join(tmpDir, "systems-cache", "test-sys");
    await mkdir(cachePath, { recursive: true });
    await writeEntitlements(cachePath, ["nachweis"]);

    // Write a public evidence-source
    await writePbpEntity(cachePath, "evidence-source", "public-record", {
      kind: "certificate",
      slug: "public-record",
      titleDe: "Public Record",
      titleUk: "Публічний запис",
      publication: { visibility: "public", publishedAt: "2026-01-01T00:00:00.000Z" },
      items: { main: { sha256: "abc123", storage: "public" } },
    });

    // Write a private evidence-source
    await writePbpEntity(cachePath, "evidence-source", "private-record", {
      kind: "certificate",
      slug: "private-record",
      titleDe: "Private Record",
      titleUk: "Приватний запис",
      publication: { visibility: "private" },
    });

    const { runNachweisManifestGenerate } = await import("../nachweis/nachweis-manifest.ts");
    const result = await runNachweisManifestGenerate(
      makeInput({ system: "test-sys" }),
      makeContext("test-sys"),
    );

    expect(result.exitCode).toBe(0);
    expect(expectData(result).records).toHaveLength(1);
    expect(expectData(result).records[0].slug).toBe("public-record");
  });
});

describe("RFC-0707: nachweis.validate", () => {
  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "nachweis-validate-XXXX-"));
    workspaceRoot = tmpDir;
    await writeFile(join(tmpDir, "package.json"), JSON.stringify({ version: "1.0.0" }) + "\n");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("skips silently when nachweis entitlement is not resolved", async () => {
    const { runNachweisValidate } = await import("../nachweis/nachweis-validate.ts");
    const result = await runNachweisValidate(
      makeInput({ system: "test-sys" }),
      makeContext("test-sys"),
    );
    expect(result.exitCode).toBe(0);
    expect(result.summary).toContain("skipped");
  });

  it("reports violations for evidence-source with nachweis kind but missing sha256", async () => {
    const cachePath = join(tmpDir, "systems-cache", "test-sys");
    await mkdir(cachePath, { recursive: true });
    await writeEntitlements(cachePath, ["nachweis"]);

    await writePbpEntity(cachePath, "evidence-source", "test-record", {
      kind: "certificate",
      slug: "test-record",
      titleDe: "Test",
      titleUk: "Тест",
      items: { main: {} },
    });

    const { runNachweisValidate } = await import("../nachweis/nachweis-validate.ts");
    const result = await runNachweisValidate(
      makeInput({ system: "test-sys" }),
      makeContext("test-sys"),
    );

    expect(result.exitCode).toBe(1);
    expect(expectData(result).violations.length).toBeGreaterThan(0);
    const shaViolation = expectData(result).violations.find(
      (v) => v.rule === "evidence-missing-sha256",
    );
    expect(shaViolation).toBeTruthy();
  });

  it("reports violations for granted consent without grantedAt", async () => {
    const cachePath = join(tmpDir, "systems-cache", "test-sys");
    await mkdir(cachePath, { recursive: true });
    await writeEntitlements(cachePath, ["nachweis"]);

    await writePbpEntity(cachePath, "consent", "test-record", {
      type: "consent",
      name: "Test Consent",
      textVersion: "v1",
      purposes: ["nachweis"],
      channels: ["web"],
      dataElements: ["name"],
      method: "verified_business_email",
      grantedAt: null,
      evidenceRef: null,
      consentStatus: "granted",
    });

    const { runNachweisValidate } = await import("../nachweis/nachweis-validate.ts");
    const result = await runNachweisValidate(
      makeInput({ system: "test-sys" }),
      makeContext("test-sys"),
    );

    expect(expectData(result).violations).toContainEqual(
      expect.objectContaining({ rule: "consent-granted-without-timestamp" }),
    );
  });

  it("passes with no violations when entities are clean", async () => {
    const cachePath = join(tmpDir, "systems-cache", "test-sys");
    await mkdir(cachePath, { recursive: true });
    await writeEntitlements(cachePath, ["nachweis"]);

    await writePbpEntity(cachePath, "evidence-source", "test-record", {
      kind: "certificate",
      slug: "test-record",
      titleDe: "Test",
      titleUk: "Тест",
      items: { main: { sha256: "a".repeat(64) } },
    });

    const { runNachweisValidate } = await import("../nachweis/nachweis-validate.ts");
    const result = await runNachweisValidate(
      makeInput({ system: "test-sys" }),
      makeContext("test-sys"),
    );

    expect(expectData(result).violations.filter((v) => v.rule !== "bordbuch-hash-chain")).toEqual(
      [],
    );
  });
});

describe("RFC-0707: nachweis.consent.update", () => {
  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "nachweis-consent-XXXX-"));
    workspaceRoot = tmpDir;
    await writeFile(join(tmpDir, "package.json"), JSON.stringify({ version: "1.0.0" }) + "\n");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("skips silently when nachweis entitlement is not resolved", async () => {
    const { runNachweisConsentUpdate } = await import("../nachweis/nachweis-consent.ts");
    const result = await runNachweisConsentUpdate(
      makeInput({ system: "test-sys", "consent-id": "test", status: "granted" }),
      makeContext("test-sys"),
    );
    expect(result.exitCode).toBe(0);
    expect(result.summary).toContain("skipped");
  });

  it("updates consent status and appends bordbuch entry", async () => {
    const cachePath = join(tmpDir, "systems-cache", "test-sys");
    await mkdir(cachePath, { recursive: true });
    await writeEntitlements(cachePath, ["nachweis"]);

    await writePbpEntity(cachePath, "consent", "test-consent", {
      type: "consent",
      name: "Test Consent",
      textVersion: "v1",
      purposes: ["nachweis"],
      channels: ["web"],
      dataElements: ["name"],
      method: "none",
      grantedAt: null,
      evidenceRef: null,
      consentStatus: "not_requested",
    });

    const { runNachweisConsentUpdate } = await import("../nachweis/nachweis-consent.ts");
    const result = await runNachweisConsentUpdate(
      makeInput({
        system: "test-sys",
        "consent-id": "test-consent",
        status: "granted",
        method: "verified_business_email",
      }),
      makeContext("test-sys"),
    );

    expect(result.exitCode).toBe(0);
    expect(expectData(result).previousStatus).toBe("not_requested");
    expect(expectData(result).newStatus).toBe("granted");
    expect(expectData(result).bordbuchEventId).toBeTruthy();

    // Verify file was updated
    const consentFile = join(
      cachePath,
      "src",
      "content",
      "business-profile",
      "de",
      "trust/consents",
      "test-consent.md",
    );
    const raw = await readFile(consentFile, "utf8");
    expect(raw).toContain("granted");
    expect(raw).toContain("verified_business_email");
  });
});

describe("RFC-0707: nachweis.publish", () => {
  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "nachweis-publish-XXXX-"));
    workspaceRoot = tmpDir;
    await writeFile(join(tmpDir, "package.json"), JSON.stringify({ version: "1.0.0" }) + "\n");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("skips silently when nachweis entitlement is not resolved", async () => {
    const { runNachweisPublish } = await import("../nachweis/nachweis-publish.ts");
    const result = await runNachweisPublish(
      makeInput({ system: "test-sys", slug: "test-record" }),
      makeContext("test-sys"),
    );
    expect(result.exitCode).toBe(0);
    expect(result.summary).toContain("skipped");
  });

  it("fails gate when conditions not met", async () => {
    const cachePath = join(tmpDir, "systems-cache", "test-sys");
    await mkdir(cachePath, { recursive: true });
    await writeEntitlements(cachePath, ["nachweis"]);

    await writePbpEntity(cachePath, "evidence-source", "test-record", {
      kind: "certificate",
      slug: "test-record",
      titleDe: "Test",
      titleUk: "Тест",
      items: { main: { sha256: "a".repeat(64) } },
    });

    const { runNachweisPublish } = await import("../nachweis/nachweis-publish.ts");
    const result = await runNachweisPublish(
      makeInput({ system: "test-sys", slug: "test-record" }),
      makeContext("test-sys"),
    );

    expect(result.exitCode).toBe(1);
    expect(expectData(result).published).toBe(false);
    expect(expectData(result).gateResult.allPassed).toBe(false);
    expect(expectData(result).gateResult.consentGranted).toBe(false);
  });
});

describe("RFC-0707: nachweis.withdraw", () => {
  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "nachweis-withdraw-XXXX-"));
    workspaceRoot = tmpDir;
    await writeFile(join(tmpDir, "package.json"), JSON.stringify({ version: "1.0.0" }) + "\n");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("skips silently when nachweis entitlement is not resolved", async () => {
    const { runNachweisWithdraw } = await import("../nachweis/nachweis-withdraw.ts");
    const result = await runNachweisWithdraw(
      makeInput({ system: "test-sys", slug: "test-record" }),
      makeContext("test-sys"),
    );
    expect(result.exitCode).toBe(0);
    expect(result.summary).toContain("skipped");
  });

  it("returns no-op when already withdrawn", async () => {
    const cachePath = join(tmpDir, "systems-cache", "test-sys");
    await mkdir(cachePath, { recursive: true });
    await writeEntitlements(cachePath, ["nachweis"]);

    await writePbpEntity(cachePath, "evidence-source", "test-record", {
      kind: "certificate",
      slug: "test-record",
      titleDe: "Test",
      titleUk: "Тест",
      recordStatus: "withdrawn",
      publication: { visibility: "private" },
    });

    const { runNachweisWithdraw } = await import("../nachweis/nachweis-withdraw.ts");
    const result = await runNachweisWithdraw(
      makeInput({ system: "test-sys", slug: "test-record" }),
      makeContext("test-sys"),
    );

    expect(result.exitCode).toBe(0);
    expect(expectData(result).withdrawn).toBe(false);
    expect(expectData(result).alreadyWithdrawn).toBe(true);
    expect(expectData(result).bordbuchEventIds).toEqual([]);
  });

  it("withdraws record and appends bordbuch entries", async () => {
    const cachePath = join(tmpDir, "systems-cache", "test-sys");
    await mkdir(cachePath, { recursive: true });
    await writeEntitlements(cachePath, ["nachweis"]);

    await writePbpEntity(cachePath, "evidence-source", "test-record", {
      kind: "certificate",
      slug: "test-record",
      titleDe: "Test",
      titleUk: "Тест",
      recordStatus: "published",
      publication: { visibility: "public", publishedAt: "2026-01-01T00:00:00.000Z" },
    });

    const { runNachweisWithdraw } = await import("../nachweis/nachweis-withdraw.ts");
    const result = await runNachweisWithdraw(
      makeInput({ system: "test-sys", slug: "test-record", reason: "test withdrawal" }),
      makeContext("test-sys"),
    );

    expect(result.exitCode).toBe(0);
    expect(expectData(result).withdrawn).toBe(true);
    expect(expectData(result).alreadyWithdrawn).toBe(false);
    expect(expectData(result).bordbuchEventIds).toHaveLength(2);

    // Verify file was updated
    const evidenceFile = join(
      cachePath,
      "src",
      "content",
      "business-profile",
      "de",
      "trust/evidence",
      "test-record.md",
    );
    const raw = await readFile(evidenceFile, "utf8");
    expect(raw).toContain("withdrawn");
    expect(raw).toContain("private");
  });
});

describe("RFC-0714: nachweis.approve", () => {
  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "nachweis-approve-XXXX-"));
    workspaceRoot = tmpDir;
    await writeFile(join(tmpDir, "package.json"), JSON.stringify({ version: "1.0.0" }) + "\n");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("skips silently when nachweis entitlement is not resolved", async () => {
    const { runNachweisApprove } = await import("../nachweis/nachweis-approve.ts");
    const result = await runNachweisApprove(
      makeInput({
        system: "test-sys",
        slug: "test-record",
        "verification-level": "N3",
        "legal-content-check": "passed",
      }),
      makeContext("test-sys"),
    );
    expect(result.exitCode).toBe(0);
    expect(result.summary).toContain("skipped");
  });

  it("appends bordbuch entry with approved summary and metadata", async () => {
    const cachePath = join(tmpDir, "systems-cache", "test-sys");
    await mkdir(cachePath, { recursive: true });
    await writeEntitlements(cachePath, ["nachweis"]);

    await writePbpEntity(cachePath, "evidence-source", "test-record", {
      kind: "certificate",
      slug: "test-record",
      titleDe: "Test",
      titleUk: "Тест",
      items: { main: { sha256: "a".repeat(64) } },
    });

    const { runNachweisApprove } = await import("../nachweis/nachweis-approve.ts");
    const result = await runNachweisApprove(
      makeInput({
        system: "test-sys",
        slug: "test-record",
        "verification-level": "N2",
        "legal-content-check": "passed",
      }),
      makeContext("test-sys"),
    );

    expect(result.exitCode).toBe(0);
    expect(expectData(result).verificationLevel).toBe("N2");
    expect(expectData(result).legalContentCheckPassed).toBe(true);
    expect(expectData(result).bordbuchEventId).toBeTruthy();

    const bordbuchPath = join(tmpDir, "systems-cache", "test-sys", "bordbuch", "events.ndjson");
    const bordbuchRaw = await readFile(bordbuchPath, "utf8");
    const entries = bordbuchRaw
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    const approveEntry = entries.find(
      (e: Record<string, unknown>) =>
        e.kind === "nachweis-record" && (e.summary as string).includes("approved"),
    ) as Record<string, unknown> | undefined;
    expect(approveEntry).toBeTruthy();
    expect(approveEntry!.summary as string).toContain("approved");
    const metadata = approveEntry!.metadata as Record<string, unknown>;
    expect(metadata.verificationLevel).toBe("N2");
    expect(metadata.legalContentCheckPassed).toBe(true);
    expect(metadata.approved).toBe(true);
  });

  it("dry-run returns result without appending bordbuch", async () => {
    const cachePath = join(tmpDir, "systems-cache", "test-sys");
    await mkdir(cachePath, { recursive: true });
    await writeEntitlements(cachePath, ["nachweis"]);

    await writePbpEntity(cachePath, "evidence-source", "test-record", {
      kind: "certificate",
      slug: "test-record",
      titleDe: "Test",
      titleUk: "Тест",
      items: { main: { sha256: "a".repeat(64) } },
    });

    const { runNachweisApprove } = await import("../nachweis/nachweis-approve.ts");
    const result = await runNachweisApprove(
      makeInput({
        system: "test-sys",
        slug: "test-record",
        "verification-level": "N3",
        "legal-content-check": "passed",
        "dry-run": true,
      }),
      makeContext("test-sys"),
    );

    expect(result.exitCode).toBe(0);
    expect(expectData(result).bordbuchEventId).toBeNull();
    expect(result.summary).toContain("DRY RUN");

    const bordbuchPath = join(tmpDir, "systems-cache", "test-sys", "bordbuch", "events.ndjson");
    expect(existsSync(bordbuchPath)).toBe(false);
  });

  it("emits logger.warn when evidence-source file not found for slug", async () => {
    const cachePath = join(tmpDir, "systems-cache", "test-sys");
    await mkdir(cachePath, { recursive: true });
    await writeEntitlements(cachePath, ["nachweis"]);

    const logger = createKernelLogger();
    const warnSpy = vi.spyOn(logger, "warn");
    const { io } = createDefaultIO();
    const ctx = {
      workspaceRoot,
      logger,
      io,
      fileIntents: [],
      commandName: "test",
      site: { name: "test-sys" },
    } as unknown as KernelRuntimeContext;

    const { runNachweisApprove } = await import("../nachweis/nachweis-approve.ts");
    const result = await runNachweisApprove(
      makeInput({
        system: "test-sys",
        slug: "nonexistent-record",
        "verification-level": "N2",
        "legal-content-check": "passed",
      }),
      ctx,
    );

    expect(result.exitCode).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("no evidence-source file found for slug 'nonexistent-record'"),
    );
  });

  it("rejects invalid verification-level with INVALID_VERIFICATION_LEVEL error", async () => {
    const cachePath = join(tmpDir, "systems-cache", "test-sys");
    await mkdir(cachePath, { recursive: true });
    await writeEntitlements(cachePath, ["nachweis"]);

    const { runNachweisApprove } = await import("../nachweis/nachweis-approve.ts");
    await expect(
      runNachweisApprove(
        makeInput({
          system: "test-sys",
          slug: "test-record",
          "verification-level": "N5",
          "legal-content-check": "passed",
        }),
        makeContext("test-sys"),
      ),
    ).rejects.toThrow("INVALID_VERIFICATION_LEVEL");
  });

  it("rejects invalid legal-content-check with INVALID_LEGAL_CONTENT_CHECK error", async () => {
    const cachePath = join(tmpDir, "systems-cache", "test-sys");
    await mkdir(cachePath, { recursive: true });
    await writeEntitlements(cachePath, ["nachweis"]);

    const { runNachweisApprove } = await import("../nachweis/nachweis-approve.ts");
    await expect(
      runNachweisApprove(
        makeInput({
          system: "test-sys",
          slug: "test-record",
          "verification-level": "N3",
          "legal-content-check": "maybe",
        }),
        makeContext("test-sys"),
      ),
    ).rejects.toThrow("INVALID_LEGAL_CONTENT_CHECK");
  });
});

describe("RFC-0714: nachweis.public-derivative", () => {
  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "nachweis-pubderiv-XXXX-"));
    workspaceRoot = tmpDir;
    mockR2State.objects.clear();
    mockR2State.putCalls = 0;
    mockR2State.putShouldFail = false;
    await writeFile(join(tmpDir, "package.json"), JSON.stringify({ version: "1.0.0" }) + "\n");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("skips silently when nachweis entitlement is not resolved", async () => {
    const { runNachweisPublicDerivative } =
      await import("../nachweis/nachweis-public-derivative.ts");
    const result = await runNachweisPublicDerivative(
      makeInput({
        system: "test-sys",
        slug: "test-record",
        file: "/fake.pdf",
      }),
      makeContext("test-sys"),
    );
    expect(result.exitCode).toBe(0);
    expect(result.summary).toContain("skipped");
  });

  it("throws NOT_FOUND when evidence-source file does not exist", async () => {
    const cachePath = join(tmpDir, "systems-cache", "test-sys");
    await mkdir(cachePath, { recursive: true });
    await writeEntitlements(cachePath, ["nachweis"]);

    const pdfFile = join(tmpDir, "public.pdf");
    await writeFile(pdfFile, "fake pdf content");

    const { runNachweisPublicDerivative } =
      await import("../nachweis/nachweis-public-derivative.ts");
    await expect(
      runNachweisPublicDerivative(
        makeInput({
          system: "test-sys",
          slug: "nonexistent-record",
          file: pdfFile,
        }),
        makeContext("test-sys"),
      ),
    ).rejects.toThrow("NOT_FOUND");
  });

  it("uploads PDF to R2 and updates items.public.storage to public in evidence-source entity", async () => {
    const cachePath = join(tmpDir, "systems-cache", "test-sys");
    await mkdir(cachePath, { recursive: true });
    await writeEntitlements(cachePath, ["nachweis"]);

    await writePbpEntity(cachePath, "evidence-source", "test-record", {
      kind: "certificate",
      slug: "test-record",
      titleDe: "Test",
      titleUk: "Тест",
      recordId: "nr_test-record_20260806",
      version: 1,
      items: { main: { sha256: "a".repeat(64), storage: "private" } },
    });

    const pdfContent = "fake public derivative pdf content";
    const pdfFile = join(tmpDir, "public.pdf");
    await writeFile(pdfFile, pdfContent);

    const { runNachweisPublicDerivative } =
      await import("../nachweis/nachweis-public-derivative.ts");
    const result = await runNachweisPublicDerivative(
      makeInput({
        system: "test-sys",
        slug: "test-record",
        file: pdfFile,
      }),
      makeContext("test-sys"),
    );

    expect(result.exitCode).toBe(0);
    expect(expectData(result).alreadyUploaded).toBe(false);
    expect(expectData(result).r2Path).toContain("test-sys/public/");
    expect(expectData(result).r2Path).toContain("public.pdf");
    expect(expectData(result).publicDerivativeSha256).toMatch(/^sha256:/);
    expect(expectData(result).bordbuchEventId).toBeTruthy();
    expect(mockR2State.putCalls).toBe(1);

    const evidenceFile = join(
      cachePath,
      "src",
      "content",
      "business-profile",
      "de",
      "trust/evidence",
      "test-record.md",
    );
    const raw = await readFile(evidenceFile, "utf8");
    expect(raw).toContain("public");
    expect(raw).toContain(expectData(result).publicDerivativeSha256);
  });

  it("is idempotent — returns alreadyUploaded true when same SHA-256 already recorded", async () => {
    const cachePath = join(tmpDir, "systems-cache", "test-sys");
    await mkdir(cachePath, { recursive: true });
    await writeEntitlements(cachePath, ["nachweis"]);

    const pdfContent = "fake public derivative pdf content for idempotency";
    const pdfFile = join(tmpDir, "public.pdf");
    await writeFile(pdfFile, pdfContent);

    const { computeSourceSha256 } = await import("../nachweis/nachweis-io.ts");
    const expectedHash = await computeSourceSha256(pdfFile);

    await writePbpEntity(cachePath, "evidence-source", "test-record", {
      kind: "certificate",
      slug: "test-record",
      titleDe: "Test",
      titleUk: "Тест",
      recordId: "nr_test-record_20260806",
      version: 1,
      items: {
        main: { sha256: "a".repeat(64), storage: "private" },
        public: { sha256: expectedHash, storage: "public", mediaType: "application/pdf" },
      },
    });

    const { runNachweisPublicDerivative } =
      await import("../nachweis/nachweis-public-derivative.ts");
    const result = await runNachweisPublicDerivative(
      makeInput({
        system: "test-sys",
        slug: "test-record",
        file: pdfFile,
      }),
      makeContext("test-sys"),
    );

    expect(result.exitCode).toBe(0);
    expect(expectData(result).alreadyUploaded).toBe(true);
    expect(expectData(result).bordbuchEventId).toBeNull();
    expect(mockR2State.putCalls).toBe(0);
  });

  it("dry-run returns result without uploading or updating entity", async () => {
    const cachePath = join(tmpDir, "systems-cache", "test-sys");
    await mkdir(cachePath, { recursive: true });
    await writeEntitlements(cachePath, ["nachweis"]);

    await writePbpEntity(cachePath, "evidence-source", "test-record", {
      kind: "certificate",
      slug: "test-record",
      titleDe: "Test",
      titleUk: "Тест",
      recordId: "nr_test-record_20260806",
      version: 1,
      items: { main: { sha256: "a".repeat(64), storage: "private" } },
    });

    const pdfContent = "fake public derivative pdf content for dry run";
    const pdfFile = join(tmpDir, "public.pdf");
    await writeFile(pdfFile, pdfContent);

    const { runNachweisPublicDerivative } =
      await import("../nachweis/nachweis-public-derivative.ts");
    const result = await runNachweisPublicDerivative(
      makeInput({
        system: "test-sys",
        slug: "test-record",
        file: pdfFile,
        "dry-run": true,
      }),
      makeContext("test-sys"),
    );

    expect(result.exitCode).toBe(0);
    expect(expectData(result).alreadyUploaded).toBe(false);
    expect(expectData(result).bordbuchEventId).toBeNull();
    expect(result.summary).toContain("DRY RUN");
    expect(mockR2State.putCalls).toBe(0);
  });
});

describe("RFC-0715: resolveDefaultLang", () => {
  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "nachweis-lang-XXXX-"));
    workspaceRoot = tmpDir;
    await writeFile(join(tmpDir, "package.json"), JSON.stringify({ version: "1.0.0" }) + "\n");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("throws when system.md i18n.default is missing", async () => {
    const cachePath = join(tmpDir, "systems-cache", "test-sys");
    await mkdir(join(cachePath, "src", "content"), { recursive: true });
    await writeFile(join(cachePath, "src", "content", "system.md"), "---\n---\n");

    const { resolveDefaultLang } = await import("../nachweis/nachweis-io.ts");
    await expect(resolveDefaultLang(cachePath)).rejects.toThrow("i18n.default is required");
  });

  it("throws when system.md does not exist", async () => {
    const cachePath = join(tmpDir, "systems-cache", "test-sys");
    await mkdir(cachePath, { recursive: true });

    const { resolveDefaultLang } = await import("../nachweis/nachweis-io.ts");
    await expect(resolveDefaultLang(cachePath)).rejects.toThrow();
  });

  it("returns i18n.default when system.md is valid", async () => {
    const cachePath = join(tmpDir, "systems-cache", "test-sys");
    await mkdir(join(cachePath, "src", "content"), { recursive: true });
    await writeFile(
      join(cachePath, "src", "content", "system.md"),
      "---\ni18n:\n  default: uk\n  languages:\n    - uk\n---\n",
    );

    const { resolveDefaultLang } = await import("../nachweis/nachweis-io.ts");
    const lang = await resolveDefaultLang(cachePath);
    expect(lang).toBe("uk");
  });
});

describe("RFC-0715: nachweis.validate consent matching by c.id fallback", () => {
  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "nachweis-consent-id-XXXX-"));
    workspaceRoot = tmpDir;
    await writeFile(join(tmpDir, "package.json"), JSON.stringify({ version: "1.0.0" }) + "\n");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("matches consent by c.id when data.slug is absent", async () => {
    const cachePath = join(tmpDir, "systems-cache", "test-sys");
    await mkdir(cachePath, { recursive: true });
    await writeEntitlements(cachePath, ["nachweis"]);

    await writePbpEntity(cachePath, "evidence-source", "test-record", {
      kind: "certificate",
      slug: "test-record",
      titleDe: "Test",
      titleUk: "Тест",
      items: { main: { sha256: "a".repeat(64) } },
    });

    // Write consent entity whose id matches slug but data.slug is absent
    await writePbpEntity(cachePath, "consent", "test-record", {
      type: "consent",
      name: "Test Consent",
      textVersion: "v1",
      purposes: ["nachweis"],
      channels: ["web"],
      lawfulBasis: "consent",
      method: "verified_business_email",
      grantedAt: "2026-08-01T00:00:00.000Z",
      evidenceRef: "test-record",
      consentStatus: "granted",
    });

    const { runNachweisValidate } = await import("../nachweis/nachweis-validate.ts");
    const result = await runNachweisValidate(
      makeInput({ system: "test-sys" }),
      makeContext("test-sys"),
    );

    // Gate should pass — consent matched by c.id fallback
    const gate = expectData(result).gateResults.find((g) => g.slug === "test-record");
    expect(gate).toBeTruthy();
    expect(gate!.consentGranted).toBe(true);
  });
});
