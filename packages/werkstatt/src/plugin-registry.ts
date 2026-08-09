/*
<MODULE_CONTRACT>
<purpose>Plugin registry interface and factory. The registry holds registered
WerkstattPlugin instances and resolves the single active plugin (RFC-0770).</purpose>
<non-goals>
  <item>Do not implement plugin discovery from kernel.config.ts — that is the validator's job.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0770: initial PluginRegistry interface and createPluginRegistry factory.</item>
</CHANGE_SUMMARY>
*/

import type { WerkstattPlugin } from "./plugin-contract.ts";

export interface PluginRegistry {
  register(plugin: WerkstattPlugin): void;
  /** Throws if zero or more than one stack plugin is registered. */
  resolve(): WerkstattPlugin;
  /** Returns all registered plugins (for inspection/testing). */
  list(): WerkstattPlugin[];
}

export function createPluginRegistry(): PluginRegistry {
  const plugins: WerkstattPlugin[] = [];

  return {
    register(plugin: WerkstattPlugin): void {
      if (plugins.some((p) => p.id === plugin.id)) {
        throw new Error(`Plugin already registered: ${plugin.id}`);
      }
      plugins.push(plugin);
    },

    resolve(): WerkstattPlugin {
      if (plugins.length === 0) {
        throw new Error("PLUGIN-01: no stack plugin registered");
      }
      if (plugins.length > 1) {
        const ids = plugins.map((p) => p.id).join(", ");
        throw new Error(`PLUGIN-01: multiple stack plugins registered (${ids}) — exactly one required`);
      }
      return plugins[0]!;
    },

    list(): WerkstattPlugin[] {
      return [...plugins];
    },
  };
}
