/*
<MODULE_CONTRACT>
<purpose>itch.io deploy adapter for the Godot plugin.</purpose>
<keywords>deploy, itch-io, godot</keywords>
<responsibilities>
  <item>Deploys game build to itch.io using butler CLI.</item>
  <item>Credentials (itch.io API key) injected from channel config: deploy.itch.apiKey.</item>
  <item>Never reads credentials from environment variables directly.</item>
</responsibilities>
<non-goals>
  <item>Does not build — build hook runs before deploy.</item>
  <item>Does not manage DNS or custom domains.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial itch.io deploy adapter — butler push to itch.io.</item>
</CHANGE_SUMMARY>
*/

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { DeployResult } from "./types.ts";

export interface ItchIoDeployConfig {
  apiKey: string;
  project: string;
  channel?: string;
  buildDir?: string;
}

export interface ItchIoAdapter {
  deploy(workpiecePath: string, config: ItchIoDeployConfig): DeployResult;
}

export function createItchIoAdapter(): ItchIoAdapter {
  return {
    deploy(workpiecePath: string, config: ItchIoDeployConfig): DeployResult {
      const buildDir = config.buildDir ?? "bin/Debug";
      const channel = config.channel ?? "windows";
      const buildPath = join(workpiecePath, buildDir);

      if (!existsSync(buildPath)) {
        return {
          success: false,
          errors: [`Build directory not found at ${buildPath} — run build first`],
        };
      }

      if (!config.apiKey) {
        return {
          success: false,
          errors: ["itch.io API key not provided in channel config (deploy.itch.apiKey)"],
        };
      }

      if (!config.project) {
        return {
          success: false,
          errors: ["itch.io project not provided in channel config (deploy.itch.project)"],
        };
      }

      try {
        const env: Record<string, string> = {
          ...process.env,
          BUTLER_API_KEY: config.apiKey,
        };

        execFileSync("butler", ["push", buildPath, `${config.project}:${channel}`], {
          cwd: workpiecePath,
          encoding: "utf-8",
          timeout: 300_000,
          stdio: ["pipe", "pipe", "pipe"],
          env,
        });

        return {
          success: true,
          url: `https://${config.project}.itch.io/${channel}`,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          errors: [`itch.io deploy failed: ${message}`],
        };
      }
    },
  };
}
