/*
<MODULE_CONTRACT>
  <purpose>RFC-0851: leitstand.propagate blocked by CERT-TRANSITION-01 during certification transition.</purpose>
  <keywords>RFC-0851, CERT-TRANSITION-01, leitstand, propagate, transition-block, test</keywords>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0851: replace legacy propagate tests with transition-block assertion.</item>
</CHANGE_SUMMARY>
*/

import { test, expect } from "vitest";
import { runLeitstandPropagate } from "../leitstand/leitstand-commands.ts";
import type { KernelRuntimeContext, KernelCommandInput } from "@warpgogol/werkstatt/kernel";
import { expectTransitionBlock } from "./helpers/transition-block-helpers.ts";

const context = { workspaceRoot: "/tmp", logger: { info: () => {}, success: () => {}, warn: () => {}, error: () => {}, debug: () => {} } } as unknown as KernelRuntimeContext;

test("leitstand.propagate blocked by CERT-TRANSITION-01", async () => {
  const input: KernelCommandInput = { flags: { release: "r000001" }, argv: [] };
  const result = await runLeitstandPropagate(input, context);
  expectTransitionBlock(result, "leitstand.propagate");
});
