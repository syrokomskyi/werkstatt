import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDefaultIO } from "@warpgogol/site-kernel";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/site-kernel";
import { extractVendorOrigins, runChatMetadataDriftValidate } from "../chat-metadata-drift.ts";

const input = { flags: {} } as unknown as KernelCommandInput;

function ctx(root: string): KernelRuntimeContext {
  return {
    workspaceRoot: root,
    outputFormat: "json",
    logger: { info() {}, warn() {}, error() {}, success() {} },
    io: createDefaultIO().io,
  } as unknown as KernelRuntimeContext;
}

function checkData(result: Awaited<ReturnType<typeof runChatMetadataDriftValidate>>): {
  status?: string;
  diagnostics?: Array<{ ruleId?: string }>;
} {
  return result.data as { status?: string; diagnostics?: Array<{ ruleId?: string }> };
}

async function writeUchatAdapter(root: string, vendorOrigins: string): Promise<void> {
  const dir = join(root, "packages", "chat-adapter-uchat", "src");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "widget-adapter.ts"),
    `
      const UCHAT_VENDOR_ORIGINS = [${vendorOrigins}] as const;
      export default {
        id: "uchat",
        requiredOptions: [["widgetId", "scriptUrl"]],
        vendorOrigins: UCHAT_VENDOR_ORIGINS,
      };
    `,
    "utf8",
  );
}

describe("chat.metadata.drift.validate", () => {
  it("reads vendor origins from const array declarations", () => {
    expect(
      extractVendorOrigins(`
        const UCHAT_VENDOR_ORIGINS = ["uchat.com.au"] as const;

        const UChatWidgetAdapter = {
          id: "uchat",
          vendorOrigins: UCHAT_VENDOR_ORIGINS,
        };
      `),
    ).toEqual(["uchat.com.au"]);
  });

  it("passes when adapter metadata matches the catalog", async () => {
    const root = await mkdtemp(join(tmpdir(), "chat-meta-pass-"));
    try {
      await writeUchatAdapter(root, '"uchat.com.au"');
      const result = await runChatMetadataDriftValidate(input, ctx(root));
      expect(result.exitCode).toBe(0);
      expect(checkData(result).status).toBe("pass");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fails when adapter vendor origins drift from the catalog", async () => {
    const root = await mkdtemp(join(tmpdir(), "chat-meta-fail-"));
    try {
      await writeUchatAdapter(root, '"wrong.example"');
      const result = await runChatMetadataDriftValidate(input, ctx(root));
      expect(result.exitCode).toBe(1);
      expect(checkData(result).status).toBe("fail");
      expect(checkData(result).diagnostics?.[0]?.ruleId).toBe("CHAT-META-02");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
