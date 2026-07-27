import { describe, it, expect } from "vitest";
import { collectOwnershipDiagnostics } from "../command-manifest-validate.ts";
import type { CommandManifestEntry } from "@warpgogol/site-kernel";

/*
<MODULE_CONTRACT>
  <purpose>
    RFC-0266 fixture tests for CMD-MAN-03: cross-checking ownership-map outputs
    against an owning command's declared writes without rebuilding the live
    workspace command registry.
  </purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Post-refactor hardening: replace slow live-registry tests with deterministic pure fixtures.</item>
</CHANGE_SUMMARY>
*/

function command(
  name: string,
  scope: "app" | "workspace",
  writes: string[],
): Pick<CommandManifestEntry, "name" | "scope" | "writes"> {
  return { name, scope, writes };
}

describe("command.manifest.validate — CMD-MAN-03 (RFC-0266)", () => {
  it("red fixture: an ownership output not reflected in the owner's writes is flagged", () => {
    const diagnostics = collectOwnershipDiagnostics(
      [command("demo.generate", "workspace", [])],
      [{ command: "demo.generate", path: "docs/demo.generated.yaml" }],
    );

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "CMD-MAN-03",
          data: expect.objectContaining({
            command: "demo.generate",
            expectedWrite: "docs/demo.generated.yaml",
          }),
        }),
      ]),
    );
  });

  it("green fixture: a workspace command with its ownership output in writes is not flagged", () => {
    const diagnostics = collectOwnershipDiagnostics(
      [command("demo.generate", "workspace", ["docs/demo.generated.yaml"])],
      [{ command: "demo.generate", path: "docs/demo.generated.yaml" }],
    );

    expect(diagnostics).toEqual([]);
  });

  it("green fixture: app-scope ownership output is matched against the <app>/ write prefix", () => {
    const diagnostics = collectOwnershipDiagnostics(
      [command("app.demo.generate", "app", ["<app>/src/demo.generated.yaml"])],
      [{ command: "app.demo.generate", path: "src/demo.generated.yaml" }],
    );

    expect(diagnostics).toEqual([]);
  });

  it("red fixture: an ownership command missing from the manifest is flagged", () => {
    const diagnostics = collectOwnershipDiagnostics(
      [],
      [{ command: "missing.generate", path: "docs/missing.generated.yaml" }],
    );

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "CMD-MAN-03",
          data: expect.objectContaining({ command: "missing.generate" }),
        }),
      ]),
    );
  });
});
