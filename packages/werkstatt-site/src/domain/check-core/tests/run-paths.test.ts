import { expect, test } from "vitest";
import { logsRelDir, runRelDir, runRelPath, screenshotsRelDir } from "../run-paths.ts";

test("run path helpers keep the artifact layout stable", () => {
  expect(runRelDir("run-1")).toBe(".check-warpgogol/runs/run-1");
  expect(runRelPath("run-1", "report.json")).toBe(".check-warpgogol/runs/run-1/report.json");
  expect(screenshotsRelDir("run-1")).toBe(".check-warpgogol/runs/run-1/screenshots");
  expect(logsRelDir("run-1")).toBe(".check-warpgogol/runs/run-1/logs");
});
