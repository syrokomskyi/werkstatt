/*
<MODULE_CONTRACT>
<purpose>
  RFC-0378: fleet.sites.generate — generates fleet/fleet.sites.yaml from
  discoverSiteWorkspaces output. Converts the fleet sites file from an authored
  file to a generated projection with a GENERATED header (RFC-0081/RFC-0336).
</purpose>
<non-goals>
  <item>Do not read or modify fleet status, plan, or killswitch state.</item>
  <item>Do not hardcode site names — derive entirely from workspace discovery.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0378: initial implementation of fleet.sites.generate command.</item>
</CHANGE_SUMMARY>
*/

import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { stringify as yamlStringify } from "yaml";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import {
  buildGeneratedHeader,
  discoverSiteWorkspaces,
  stripGeneratedMarker,
  writeFileAtomic,
} from "@warpgogol/site-kernel";

const FLEET_SITES_FILE = "fleet/fleet.sites.yaml";

interface FleetSiteRef {
  site: string;
  path: string;
}

interface FleetSitesFile {
  sites: FleetSiteRef[];
}

export async function runFleetSitesGenerate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const { workspaceRoot } = context;
  const sites = await discoverSiteWorkspaces(workspaceRoot);

  const fleetSites: FleetSitesFile = {
    sites: sites
      .map((site) => ({
        site: site.name,
        path: relative(workspaceRoot, site.directory).replace(/\\/g, "/"),
      }))
      .sort((a, b) => a.site.localeCompare(b.site)),
  };

  const outputPath = join(workspaceRoot, FLEET_SITES_FILE);
  await mkdir(dirname(outputPath), { recursive: true });

  const header = buildGeneratedHeader({
    filePath: FLEET_SITES_FILE,
    ownerCommand: "fleet.sites.generate",
  });
  const body = yamlStringify(fleetSites);
  const content = `${header}\n${body}`;

  await writeFileAtomic(outputPath, content);

  return {
    exitCode: 0,
    summary: `fleet.sites.generate: wrote ${fleetSites.sites.length} site(s) to ${FLEET_SITES_FILE}`,
    data: {
      command: "fleet.sites.generate",
      sites: fleetSites.sites,
      written: FLEET_SITES_FILE,
    },
  };
}

export async function validateFleetSitesDrift(
  workspaceRoot: string,
): Promise<{ drifted: boolean; expected: string; actual: string }> {
  const sites = await discoverSiteWorkspaces(workspaceRoot);
  const expected: FleetSitesFile = {
    sites: sites
      .map((site) => ({
        site: site.name,
        path: relative(workspaceRoot, site.directory).replace(/\\/g, "/"),
      }))
      .sort((a, b) => a.site.localeCompare(b.site)),
  };
  const expectedContent = yamlStringify(expected);

  const filePath = join(workspaceRoot, FLEET_SITES_FILE);
  if (!existsSync(filePath)) {
    return { drifted: true, expected: expectedContent, actual: "" };
  }

  const raw = await readFile(filePath, "utf8");
  const { content: actualContent } = stripGeneratedMarker(raw);

  return {
    drifted: actualContent.trim() !== expectedContent.trim(),
    expected: expectedContent,
    actual: actualContent,
  };
}
