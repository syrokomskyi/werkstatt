import { defineKernelConfig } from "@warpgogol/werkstatt/kernel";

export default defineKernelConfig({
  name: "fixture-workshop",
  description: "Minimal workshop fixture for tarball smoke testing (RFC-0773)",
  moduleLoaders: {
    "werkstatt-plugin": async () =>
      (await import("@warpgogol/werkstatt/os/werkstatt-plugin-module")).forgeWerkstattPluginModule,
  },
  pipelines: {},
});
