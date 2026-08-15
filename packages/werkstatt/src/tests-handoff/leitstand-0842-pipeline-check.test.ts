/*
<MODULE_CONTRACT>
  <purpose>RFC-0851: leitstand.pipeline.check blocked by CERT-TRANSITION-01 during certification transition.</purpose>
  <keywords>RFC-0851, CERT-TRANSITION-01, leitstand, pipeline-check, transition-block, test</keywords>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0851: replace legacy pipeline-check tests with transition-block assertion.</item>
</CHANGE_SUMMARY>
*/

import { test, expect } from "vitest";
import { runLeitstandPipelineCheck } from "../leitstand/leitstand-commands.ts";
import type { KernelRuntimeContext, KernelCommandInput } from "@warpgogol/werkstatt/kernel";
import { expectTransitionBlock } from "./helpers/transition-block-helpers.ts";

const context = { workspaceRoot: "/tmp", logger: { info: () => {}, success: () => {}, warn: () => {}, error: () => {}, debug: () => {} } } as unknown as KernelRuntimeContext;

test("leitstand.pipeline.check blocked by CERT-TRANSITION-01", async () => {
  const input: KernelCommandInput = { flags: { release: "r000001" }, argv: [] };
  const result = await runLeitstandPipelineCheck(input, context);
  expectTransitionBlock(result, "leitstand.pipeline.check");
});
