import { describe, it, expect } from "vitest";
import { knowledgePathConventions, KNOWLEDGE_PATHS } from "../paths/knowledge-paths.ts";

describe("knowledgePathConventions", () => {
  it("sets contentDir to knowledge", () => {
    expect(knowledgePathConventions.contentDir).toBe("knowledge");
  });

  it("sets distDir to .generated/knowledge/dist", () => {
    expect(knowledgePathConventions.distDir).toBe(".generated/knowledge/dist");
  });

  it("declares manifest and schema-registry as entry points", () => {
    expect(knowledgePathConventions.entryPoints).toContain("knowledge/manifest.yaml");
    expect(knowledgePathConventions.entryPoints).toContain(
      "knowledge/ontology/schema-registry.yaml",
    );
  });
});

describe("KNOWLEDGE_PATHS", () => {
  it("exposes all required path constants", () => {
    expect(KNOWLEDGE_PATHS.contentDir).toBe("knowledge");
    expect(KNOWLEDGE_PATHS.distDir).toBe(".generated/knowledge/dist");
    expect(KNOWLEDGE_PATHS.manifest).toBe("knowledge/manifest.yaml");
    expect(KNOWLEDGE_PATHS.schemaRegistry).toBe("knowledge/ontology/schema-registry.yaml");
    expect(KNOWLEDGE_PATHS.stagingDir).toBe("staging");
    expect(KNOWLEDGE_PATHS.laboratoryDir).toBe("laboratory");
    expect(KNOWLEDGE_PATHS.projectionsDir).toBe("projections");
    expect(KNOWLEDGE_PATHS.generatedDir).toBe(".generated/knowledge");
    expect(KNOWLEDGE_PATHS.configYaml).toBe("knowledge.config.yaml");
  });

  it("is declared as const (all values are string literals)", () => {
    const keys = Object.keys(KNOWLEDGE_PATHS);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(typeof (KNOWLEDGE_PATHS as Record<string, unknown>)[key]).toBe("string");
    }
  });
});
