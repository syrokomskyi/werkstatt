/*
<MODULE_CONTRACT>
<purpose>itch.io deploy adapter for the Godot plugin — supports multi-platform channels.</purpose>
<keywords>deploy, itch-io, godot, multi-platform</keywords>
<responsibilities>
  <item>Deploys game build to itch.io using butler CLI.</item>
  <item>Supports multi-platform channels: reads export_presets.cfg and pushes each platform to its own channel.</item>
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
  <item>Fix: import DeployResult from shared deploy/types.ts instead of defining locally.</item>
  <item>Enhancement: multi-platform channel support — reads export_presets.cfg and pushes each platform to its own itch.io channel.</item>
</CHANGE_SUMMARY>
*/

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import type { DeployResult } from "./types.ts";

export interface ItchIoChannelConfig {
  channel: string;
  buildPath: string;
}

export interface ItchIoDeployConfig {
  apiKey: string;
  project: string;
  channel?: string;
  buildDir?: string;
  channels?: ItchIoChannelConfig[];
}

export interface ItchIoAdapter {
  deploy(workpiecePath: string, config: ItchIoDeployConfig): DeployResult;
}

export function createItchIoAdapter(): ItchIoAdapter {
  return {
    deploy(workpiecePath: string, config: ItchIoDeployConfig): DeployResult {
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

      const channels = resolveChannels(workpiecePath, config);
      if (channels.length === 0) {
        return {
          success: false,
          errors: ["No deployable channels found — provide channels config or export_presets.cfg"],
        };
      }

      const errors: string[] = [];
      const urls: string[] = [];

      for (const ch of channels) {
        if (!existsSync(ch.buildPath)) {
          errors.push(`Build directory not found at ${ch.buildPath} for channel "${ch.channel}"`);
          continue;
        }

        try {
          const env: Record<string, string> = {
            ...process.env,
            BUTLER_API_KEY: config.apiKey,
          };

          execFileSync("butler", ["push", ch.buildPath, `${config.project}:${ch.channel}`], {
            cwd: workpiecePath,
            encoding: "utf-8",
            timeout: 300_000,
            stdio: ["pipe", "pipe", "pipe"],
            env,
          });

          urls.push(`https://${config.project}.itch.io/${ch.channel}`);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          errors.push(`itch.io deploy failed for channel "${ch.channel}": ${message}`);
        }
      }

      if (errors.length > 0) {
        return { success: false, errors };
      }

      return {
        success: true,
        url: urls.length === 1 ? urls[0] : undefined,
        errors: urls.length > 1 ? urls : undefined,
      };
    },
  };
}

function resolveChannels(workpiecePath: string, config: ItchIoDeployConfig): ItchIoChannelConfig[] {
  if (config.channels && config.channels.length > 0) {
    return config.channels.map((ch) => ({
      channel: ch.channel,
      buildPath: join(workpiecePath, ch.buildPath),
    }));
  }

  const presetsPath = join(workpiecePath, "export_presets.cfg");
  if (existsSync(presetsPath)) {
    return resolveChannelsFromPresets(workpiecePath, presetsPath);
  }

  if (config.channel && config.buildDir) {
    return [
      {
        channel: config.channel,
        buildPath: join(workpiecePath, config.buildDir),
      },
    ];
  }

  return [
    {
      channel: config.channel ?? "windows",
      buildPath: join(workpiecePath, config.buildDir ?? "bin/Debug"),
    },
  ];
}

function resolveChannelsFromPresets(
  workpiecePath: string,
  presetsPath: string,
): ItchIoChannelConfig[] {
  const content = readFileSync(presetsPath, "utf-8");
  const channels: ItchIoChannelConfig[] = [];
  const sections = content.split(/\[preset_(\d+)\]/);

  for (let i = 1; i < sections.length; i += 2) {
    const body = sections[i + 1];
    if (!body) continue;

    const nameMatch = body.match(/^name="([^"]+)"/m);
    const platformMatch = body.match(/^platform="([^"]+)"/m);
    const pathMatch = body.match(/^export_path="([^"]+)"/m);

    if (nameMatch && platformMatch && pathMatch) {
      const exportPath = pathMatch[1]!;
      const channel = platformToChannel(platformMatch[1]!);
      channels.push({
        channel,
        buildPath: join(workpiecePath, dirname(exportPath)),
      });
    }
  }

  return channels;
}

function platformToChannel(platform: string): string {
  const map: Record<string, string> = {
    "Windows Desktop": "windows",
    "Linux/X11": "linux",
    macOS: "mac",
    Web: "html",
    Android: "android",
    iOS: "ios",
  };
  return map[platform] ?? platform.toLowerCase().replace(/[^a-z0-9]/g, "-");
}
