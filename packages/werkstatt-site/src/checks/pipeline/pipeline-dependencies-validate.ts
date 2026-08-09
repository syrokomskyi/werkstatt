/*
<MODULE_CONTRACT>
<purpose>
RFC-0686: pipeline.dependencies.validate — validates dependsOn fields in all
standard pipelines. Checks for missing references, forward references, duplicate
command names, and circular dependencies using buildSchedule from site-kernel.
</purpose>
<non-goals>
  <item>Does not execute pipeline steps — only validates the dependency graph.</item>
  <item>Does not check whether referenced commands are registered — that is pipeline.timeout.validate's scope.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0686: created — runPipelineDependenciesValidate.</item>
</CHANGE_SUMMARY>
*/

import {
  buildSchedule,
  ScheduleError,
  type KernelCommandInput,
  type KernelCommandResult,
  type KernelPipelineStep,
  type KernelRuntimeContext,
  type CheckResult,
  type Diagnostic,
} from "@warpgogol/site-kernel";
import { diagnosticsResult } from "../result-helpers.ts";
import {
  SITES_BUILD_CHECK_PIPELINE,
  SITES_BUILD_POST_PIPELINE,
  SITES_BUILD_PREPARE_PIPELINE,
  SITES_BUILD_PREPARE_DEV_PIPELINE,
  SITES_CHECK_AUTHOR_PIPELINE,
  SITES_CHECK_POSTBUILD_PIPELINE,
  PACKAGES_CHECK_PIPELINE,
  STANDARD_COMPASS_PIPELINE,
} from "../pipelines/index.ts";

interface PipelineDescriptor {
  name: string;
  steps: KernelPipelineStep[];
}

function standardPipelines(): PipelineDescriptor[] {
  return [
    // Leaf pipelines only — composite pipelines (sites-check.run) concatenate
    // author + postbuild and naturally contain duplicate command names.
    { name: "sites-check.author", steps: SITES_CHECK_AUTHOR_PIPELINE },
    { name: "sites-check.postbuild", steps: SITES_CHECK_POSTBUILD_PIPELINE },
    { name: "build.prepare", steps: SITES_BUILD_PREPARE_PIPELINE },
    { name: "build.prepare.dev", steps: SITES_BUILD_PREPARE_DEV_PIPELINE },
    { name: "build.check", steps: SITES_BUILD_CHECK_PIPELINE },
    { name: "build.post", steps: SITES_BUILD_POST_PIPELINE },
    { name: "packages-check.run", steps: PACKAGES_CHECK_PIPELINE },
    { name: "packages.check", steps: PACKAGES_CHECK_PIPELINE },
    { name: "standard-compass", steps: STANDARD_COMPASS_PIPELINE },
  ];
}

export async function runPipelineDependenciesValidate(
  _input: KernelCommandInput,
  _context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const command = "pipeline.dependencies.validate";
  const diagnostics: Diagnostic[] = [];
  const pipelines = standardPipelines();

  for (const pipeline of pipelines) {
    try {
      buildSchedule(pipeline.steps);
    } catch (error) {
      if (error instanceof ScheduleError) {
        diagnostics.push({
          ruleId: "DEP-01",
          severity: "error",
          message: `[${pipeline.name}] ${error.message}`,
        });
      } else {
        throw error;
      }
    }
  }

  return diagnosticsResult(command, diagnostics);
}
