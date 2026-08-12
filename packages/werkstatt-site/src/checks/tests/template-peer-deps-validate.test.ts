import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/*
<MODULE_CONTRACT>
  <purpose>
    Unit tests for template.peer-deps.validate (RFC-0815).
    Mocks child_process.execFile and node:fs/promises to avoid real pnpm/registry calls.
  </purpose>
</MODULE_CONTRACT>
*/

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  mkdtemp: vi.fn().mockResolvedValue("/tmp/peer-deps-validate-xxx"),
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("node:os", () => ({
  tmpdir: vi.fn().mockReturnValue("/tmp"),
}));

vi.mock("../../onboarding/templates.ts", () => ({
  TEMPLATES_DIR: "/fake/templates",
}));

const { runTemplatePeerDepsValidate } = await import("../template-peer-deps-validate.ts");
const { execFile } = await import("node:child_process");
const { readFile, writeFile } = await import("node:fs/promises");

const mockExecFile = vi.mocked(execFile);
const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);

function makeInput(site: string = "test-site") {
  return {
    command: "template.peer-deps.validate",
    args: [],
    flags: { site },
  } as any;
}

function makeContext() {
  return {
    workspaceRoot: "/fake/workspace",
    site: { name: "test-site" },
  } as any;
}

function mockExecFileSuccess() {
  mockExecFile.mockImplementation(((_cmd: any, _args: any, _opts: any, cb: any) => {
    cb(null, "[]", "");
  }) as any);
}

function mockExecFileError(stdout: string, stderr: string) {
  mockExecFile.mockImplementation(((_cmd: any, _args: any, _opts: any, cb: any) => {
    const err = new Error("pnpm error") as any;
    err.stdout = stdout;
    err.stderr = stderr;
    cb(err, stdout, stderr);
  }) as any);
}

const TEMPLATE_WITH_WORKSPACE_DEPS = JSON.stringify({
  name: "{{CLIENT_ID}}",
  dependencies: {
    "@warpgogol/forge": "workspace:*",
    "@warpgogol/werkstatt": "workspace:*",
    "@warpgogol/werkstatt-site": "workspace:*",
    astro: "^4.16.0",
    wrangler: "^4.120.0",
  },
  devDependencies: {
    "@astrojs/cloudflare": "^12.0.0",
  },
});

describe("template.peer-deps.validate (RFC-0815)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadFile.mockResolvedValue(TEMPLATE_WITH_WORKSPACE_DEPS);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("strips workspace:* deps from temp package.json", async () => {
    mockExecFileSuccess();

    await runTemplatePeerDepsValidate(makeInput(), makeContext());

    const writtenContent = JSON.parse(mockWriteFile.mock.calls[0]![1] as string);
    expect(writtenContent.dependencies).not.toHaveProperty("@warpgogol/forge");
    expect(writtenContent.dependencies).not.toHaveProperty("@warpgogol/werkstatt");
    expect(writtenContent.dependencies).not.toHaveProperty("@warpgogol/werkstatt-site");
    expect(writtenContent.dependencies).toHaveProperty("astro");
    expect(writtenContent.dependencies).toHaveProperty("wrangler");
  });

  it("emits PEER-01 when pnpm exits non-zero with peer dep conflict", async () => {
    const peerErrorOutput =
      'peer dependency "wrangler" "^4.120.1" required by "@cloudflare/vite-plugin"';

    mockExecFileError(peerErrorOutput, "ERR_PNPM_PEER_DEP_ISSUES");

    const result = await runTemplatePeerDepsValidate(makeInput(), makeContext());

    expect(result.exitCode).toBe(1);
    expect(result.data!.diagnostics).toHaveLength(1);
    expect(result.data!.diagnostics[0]!.ruleId).toBe("PEER-01");
    expect(result.data!.diagnostics[0]!.message).toContain("wrangler");
    expect(result.data!.diagnostics[0]!.message).toContain("^4.120.1");
  });

  it("returns pass result when pnpm exits 0 (all peer deps satisfied)", async () => {
    mockExecFileSuccess();

    const result = await runTemplatePeerDepsValidate(makeInput(), makeContext());

    expect(result.exitCode).toBe(0);
    expect(result.data!.status).toBe("pass");
    expect(result.data!.diagnostics).toHaveLength(0);
  });

  it("emits PEER-02 when template file is missing", async () => {
    mockReadFile.mockRejectedValue(new Error("ENOENT"));

    const result = await runTemplatePeerDepsValidate(makeInput(), makeContext());

    expect(result.exitCode).toBe(1);
    expect(result.data!.diagnostics[0]!.ruleId).toBe("PEER-02");
  });

  it("emits PEER-03 (warning) when resolution fails with network error", async () => {
    mockExecFileError("", "ERR_PNPM_FETCH_ERROR: Connection refused");

    const result = await runTemplatePeerDepsValidate(makeInput(), makeContext());

    expect(result.exitCode).toBe(0);
    expect(result.data!.diagnostics[0]!.ruleId).toBe("PEER-03");
    expect(result.data!.diagnostics[0]!.severity).toBe("warning");
  });

  it("defaults site to 'template' when --site and context.site are missing", async () => {
    mockExecFileSuccess();

    const input = { command: "template.peer-deps.validate", args: [], flags: {} } as any;
    const context = { workspaceRoot: "/fake" } as any;

    const result = await runTemplatePeerDepsValidate(input, context);

    expect(result.exitCode).toBe(0);
    expect(result.data!.site).toBe("template");
  });
});
