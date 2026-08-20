import { describe, it, expect } from "vitest";
import { werkstattKnowledgePlugin } from "../index.ts";

describe("werkstattKnowledgePlugin", () => {
  it("declares correct schema version", () => {
    expect(werkstattKnowledgePlugin.schema).toBe("werkstatt/plugin@1");
  });

  it("declares correct plugin id", () => {
    expect(werkstattKnowledgePlugin.id).toBe("werkstatt-knowledge");
  });

  it("declares correct profile id", () => {
    expect(werkstattKnowledgePlugin.profileId).toBe("knowledge-typescript-turborepo");
  });

  it("registers exactly 5 module loaders", () => {
    const loaders = Object.keys(werkstattKnowledgePlugin.moduleLoaders);
    expect(loaders).toHaveLength(5);
    expect(loaders).toContain("knowledge-source");
    expect(loaders).toContain("knowledge-core");
    expect(loaders).toContain("knowledge-extract");
    expect(loaders).toContain("knowledge-materialize");
    expect(loaders).toContain("knowledge-release");
  });

  it("registers all 5 hooks", () => {
    const hooks = werkstattKnowledgePlugin.hooks!;
    expect(hooks.materialize).toBeDefined();
    expect(hooks.build).toBeDefined();
    expect(hooks.checkGate).toBeDefined();
    expect(hooks.releaseEvidence).toBeDefined();
    expect(hooks.scaffoldProject).toBeDefined();
  });

  it("does not declare deploy adapters", () => {
    expect(werkstattKnowledgePlugin.deployAdapters).toBeUndefined();
  });

  it("declares KNO-001..028 invariants", () => {
    expect(werkstattKnowledgePlugin.invariants).toHaveLength(28);
    const ids = werkstattKnowledgePlugin.invariants!.map((inv) => inv.id);
    expect(ids[0]).toBe("KNO-001");
    expect(ids[27]).toBe("KNO-028");
  });

  it("exposes path conventions", () => {
    expect(werkstattKnowledgePlugin.paths).toBeDefined();
    expect(werkstattKnowledgePlugin.paths.contentDir).toBe("knowledge");
    expect(werkstattKnowledgePlugin.paths.distDir).toBe(".generated/knowledge/dist");
    expect(werkstattKnowledgePlugin.paths.entryPoints).toContain("knowledge/manifest.yaml");
  });
});
