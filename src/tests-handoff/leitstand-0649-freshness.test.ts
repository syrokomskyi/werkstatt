/*
<MODULE_CONTRACT>
  <purpose>RFC-0851: leitstand.dev-deploy freshness tests replaced by CERT-TRANSITION-01 block.</purpose>
  <keywords>RFC-0851, CERT-TRANSITION-01, leitstand, dev-deploy, freshness, transition-block, test</keywords>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0851: replace legacy freshness tests with transition-block assertion.</item>
</CHANGE_SUMMARY>
*/

import { test, expect } from "vitest";
import { runLeitstandDevDeploy } from "../leitstand/leitstand-commands.ts";
import type { KernelRuntimeContext, KernelCommandInput } from "@warpgogol/werkstatt/kernel";
import { expectTransitionBlock } from "./helpers/transition-block-helpers.ts";

const context = { workspaceRoot: "/tmp", logger: { info: () => {}, success: () => {}, warn: () => {}, error: () => {}, debug: () => {} } } as unknown as KernelRuntimeContext;

test("leitstand.dev-deploy (freshness) blocked by CERT-TRANSITION-01", async () => {
  const input: KernelCommandInput = { flags: { site: "test-sys" }, argv: [] };
  const result = await runLeitstandDevDeploy(input, context);
  expectTransitionBlock(result, "leitstand.dev-deploy");
});
