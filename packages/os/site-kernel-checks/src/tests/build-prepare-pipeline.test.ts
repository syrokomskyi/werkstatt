/*
<MODULE_CONTRACT>
  <purpose>
    RFC-0604: tests for build-prepare pipeline membership — verifies bordbuch.generate
    and passport.key.ensure are in the main pipeline before generated.files.validate
    and absent from the dev-mode pipeline.
  </purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0604: initial pipeline membership tests.</item>
</CHANGE_SUMMARY>
*/

import { test, expect } from "vitest";
import {
  SITES_BUILD_PREPARE_PIPELINE,
  SITES_BUILD_PREPARE_DEV_PIPELINE,
} from "../pipelines/build-prepare.ts";

const mainCommands = SITES_BUILD_PREPARE_PIPELINE.map((s) => s.command);
const devCommands = SITES_BUILD_PREPARE_DEV_PIPELINE.map((s) => s.command);

test("bordbuch.generate is in SITES_BUILD_PREPARE_PIPELINE", () => {
  expect(mainCommands).toContain("bordbuch.generate");
});

test("passport.key.ensure is in SITES_BUILD_PREPARE_PIPELINE", () => {
  expect(mainCommands).toContain("passport.key.ensure");
});

test("bordbuch.generate appears before generated.files.validate", () => {
  const bordbuchIdx = mainCommands.indexOf("bordbuch.generate");
  const validateIdx = mainCommands.indexOf("generated.files.validate");
  expect(bordbuchIdx).toBeGreaterThan(-1);
  expect(validateIdx).toBeGreaterThan(-1);
  expect(bordbuchIdx).toBeLessThan(validateIdx);
});

test("passport.key.ensure appears after bordbuch.generate", () => {
  const bordbuchIdx = mainCommands.indexOf("bordbuch.generate");
  const passportIdx = mainCommands.indexOf("passport.key.ensure");
  expect(bordbuchIdx).toBeGreaterThan(-1);
  expect(passportIdx).toBeGreaterThan(-1);
  expect(passportIdx).toBeGreaterThan(bordbuchIdx);
});

test("bordbuch.generate is NOT in SITES_BUILD_PREPARE_DEV_PIPELINE", () => {
  expect(devCommands).not.toContain("bordbuch.generate");
});

test("passport.key.ensure is NOT in SITES_BUILD_PREPARE_DEV_PIPELINE", () => {
  expect(devCommands).not.toContain("passport.key.ensure");
});
