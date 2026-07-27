import { describe, it, expect } from "vitest";
import { readScopeFiles, outOfScope } from "../scope.ts";
import type { KernelCommandInput } from "@gogol/site-kernel";

function input(args: string[], flags: Record<string, unknown> = {}): KernelCommandInput {
  return { args, flags } as unknown as KernelCommandInput;
}

describe("readScopeFiles (RFC-0139)", () => {
  it("returns null when --scope-files is absent (whole-app, unchanged behavior)", () => {
    expect(readScopeFiles(input([]))).toBeNull();
  });

  it("parses a comma list from a --scope-files= arg", () => {
    const set = readScopeFiles(input(["--scope-files=a/b.md,c/d.md"]));
    expect(set).not.toBeNull();
    expect(set!.has("a/b.md")).toBe(true);
    expect(set!.has("c/d.md")).toBe(true);
  });

  it("parses from a flags entry and normalizes backslashes", () => {
    const set = readScopeFiles(input([], { "scope-files": "a\\b.md, c/d.md " }));
    expect(set!.has("a/b.md")).toBe(true);
    expect(set!.has("c/d.md")).toBe(true);
  });

  it("treats an empty list as null", () => {
    expect(readScopeFiles(input(["--scope-files="]))).toBeNull();
  });
});

describe("outOfScope (RFC-0139)", () => {
  const allow = readScopeFiles(input(["--scope-files=apps/x/pages/de/agb.md"]));
  it("never skips when scope is null (whole-app)", () => {
    expect(outOfScope(null, "anything.md")).toBe(false);
  });
  it("keeps in-scope files", () => {
    expect(outOfScope(allow, "apps/x/pages/de/agb.md")).toBe(false);
    expect(outOfScope(allow, "apps\\x\\pages\\de\\agb.md")).toBe(false);
  });
  it("skips out-of-scope files", () => {
    expect(outOfScope(allow, "apps/x/pages/de/home.md")).toBe(true);
  });
});
