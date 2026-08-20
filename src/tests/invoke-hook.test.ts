import { test, expect } from "vitest";
import { invokeHook, invokeMaterializeHook, invokeBuildHook, invokeCheckGateHook, invokeReleaseEvidenceHook, invokeScaffoldProjectHook } from "../plugin/invoke-hook.ts";
import { createPluginRegistry } from "../plugin-registry.ts";
import type { WerkstattPlugin, PluginHookContext, HookResult } from "../plugin-contract.ts";

function makeCtx(): PluginHookContext {
  return {
    workspaceRoot: "/tmp/workspace",
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };
}

function makePlugin(hooks?: WerkstattPlugin["hooks"]): WerkstattPlugin {
  return {
    schema: "werkstatt/plugin@1",
    id: "test-plugin",
    profileId: "astro-typescript-turborepo",
    moduleLoaders: {},
    paths: { contentDir: "src/content", distDir: "dist", entryPoints: [] },
    hooks,
  };
}

test("invokeHook returns neutral success when hook is undefined", async () => {
  const registry = createPluginRegistry();
  registry.register(makePlugin());
  const result = await invokeHook(registry, "materialize", makeCtx());
  expect(result.success).toBe(true);
  expect(result.data).toBeUndefined();
});

test("invokeHook calls the registered hook and returns its result", async () => {
  const registry = createPluginRegistry();
  const hookResult: HookResult = { success: true, data: { built: true } };
  registry.register(
    makePlugin({
      build: async () => hookResult,
    }),
  );
  const result = await invokeHook(registry, "build", makeCtx());
  expect(result).toBe(hookResult);
});

test("invokeHook propagates hook failure", async () => {
  const registry = createPluginRegistry();
  registry.register(
    makePlugin({
      build: async () => ({ success: false, errors: ["build failed"] }),
    }),
  );
  const result = await invokeHook(registry, "build", makeCtx());
  expect(result.success).toBe(false);
  expect(result.errors).toEqual(["build failed"]);
});

test("invokeHook throws PLUGIN-01 when no plugin is registered", async () => {
  const registry = createPluginRegistry();
  await expect(invokeHook(registry, "materialize", makeCtx())).rejects.toThrow("PLUGIN-01");
});

test("invokeMaterializeHook calls materialize hook", async () => {
  const registry = createPluginRegistry();
  let called = false;
  registry.register(
    makePlugin({
      materialize: async () => {
        called = true;
        return { success: true };
      },
    }),
  );
  const result = await invokeMaterializeHook(registry, makeCtx());
  expect(called).toBe(true);
  expect(result.success).toBe(true);
});

test("invokeMaterializeHook returns neutral success when no materialize hook", async () => {
  const registry = createPluginRegistry();
  registry.register(makePlugin());
  const result = await invokeMaterializeHook(registry, makeCtx());
  expect(result.success).toBe(true);
});

test("invokeBuildHook calls build hook", async () => {
  const registry = createPluginRegistry();
  let called = false;
  registry.register(
    makePlugin({
      build: async () => {
        called = true;
        return { success: true, data: "built" };
      },
    }),
  );
  const result = await invokeBuildHook(registry, makeCtx());
  expect(called).toBe(true);
  expect(result.success).toBe(true);
  expect(result.data).toBe("built");
});

test("invokeCheckGateHook calls checkGate hook with baseUrl", async () => {
  const registry = createPluginRegistry();
  let receivedUrl: string | undefined;
  registry.register(
    makePlugin({
      checkGate: async (ctx) => {
        receivedUrl = ctx.baseUrl;
        return { success: true };
      },
    }),
  );
  const ctx = { ...makeCtx(), baseUrl: "http://localhost:4321" };
  await invokeCheckGateHook(registry, ctx);
  expect(receivedUrl).toBe("http://localhost:4321");
});

test("invokeReleaseEvidenceHook calls releaseEvidence hook", async () => {
  const registry = createPluginRegistry();
  let called = false;
  registry.register(
    makePlugin({
      releaseEvidence: async () => {
        called = true;
        return { success: true };
      },
    }),
  );
  await invokeReleaseEvidenceHook(registry, makeCtx());
  expect(called).toBe(true);
});

test("invokeScaffoldProjectHook calls scaffoldProject hook with projectId", async () => {
  const registry = createPluginRegistry();
  let receivedProjectId: string | undefined;
  registry.register(
    makePlugin({
      scaffoldProject: async (ctx) => {
        receivedProjectId = ctx.projectId;
        return { success: true };
      },
    }),
  );
  const ctx = { ...makeCtx(), projectId: "new-site" };
  await invokeScaffoldProjectHook(registry, ctx);
  expect(receivedProjectId).toBe("new-site");
});

test("invokeHook passes context to the hook", async () => {
  const registry = createPluginRegistry();
  let receivedCtx: PluginHookContext | undefined;
  registry.register(
    makePlugin({
      materialize: async (ctx) => {
        receivedCtx = ctx;
        return { success: true };
      },
    }),
  );
  const ctx = makeCtx();
  await invokeMaterializeHook(registry, ctx);
  expect(receivedCtx).toBe(ctx);
});
