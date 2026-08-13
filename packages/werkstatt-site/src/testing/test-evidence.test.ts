import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  recordTestEvidence,
  verifyTestEvidence,
  listTestEvidence,
  resolveEvidenceDir,
  GRACE_PERIOD_END,
  type TestEvidence,
} from "./test-evidence.ts";

const inGracePeriod = new Date() < new Date(GRACE_PERIOD_END);

describe("test-evidence", () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), "test-evidence-"));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  describe("resolveEvidenceDir", () => {
    it("resolves site evidence dir with releaseId", () => {
      const dir = resolveEvidenceDir(workspaceRoot, "my-site", { releaseId: "r001" });
      expect(dir).toBe(join(workspaceRoot, "releases", "r001", ".test-evidence"));
    });

    it("resolves service evidence dir with service", () => {
      const dir = resolveEvidenceDir(workspaceRoot, "my-service", { service: "my-service" });
      expect(dir).toBe(join(workspaceRoot, "services", "my-service", ".test-evidence"));
    });
  });

  describe("recordTestEvidence", () => {
    it("writes evidence JSON file atomically", () => {
      const evidence: TestEvidence = {
        testRunId: "run-001",
        level: "L4",
        targetId: "my-site",
        commitSha: "abc123",
        passed: true,
        durationMs: 5000,
        timestamp: new Date().toISOString(),
        failures: [],
      };

      return recordTestEvidence(workspaceRoot, "my-site", evidence, { releaseId: "r001" }).then(
        () => {
          const evidencePath = join(workspaceRoot, "releases", "r001", ".test-evidence", "L4.json");
          const content = JSON.parse(readFileSync(evidencePath, "utf-8")) as TestEvidence;
          expect(content.testRunId).toBe("run-001");
          expect(content.level).toBe("L4");
          expect(content.passed).toBe(true);
          expect(content.commitSha).toBe("abc123");
        },
      );
    });

    it("writes evidence for service target", () => {
      const evidence: TestEvidence = {
        testRunId: "run-002",
        level: "L1",
        targetId: "my-service",
        commitSha: "def456",
        passed: false,
        durationMs: 1000,
        timestamp: new Date().toISOString(),
        failures: [{ testName: "test foo", message: "failed", file: "test.ts" }],
      };

      return recordTestEvidence(workspaceRoot, "my-service", evidence, {
        service: "my-service",
      }).then(() => {
        const evidencePath = join(
          workspaceRoot,
          "services",
          "my-service",
          ".test-evidence",
          "L1.json",
        );
        const content = JSON.parse(readFileSync(evidencePath, "utf-8")) as TestEvidence;
        expect(content.passed).toBe(false);
        expect(content.failures).toHaveLength(1);
        expect(content.failures[0].testName).toBe("test foo");
      });
    });
  });

  describe("verifyTestEvidence", () => {
    it("passes when all evidence exists, passed, and commitSha matches", () => {
      const commitSha = "abc123";
      const evidence: TestEvidence = {
        testRunId: "run-001",
        level: "L4",
        targetId: "my-site",
        commitSha,
        passed: true,
        durationMs: 5000,
        timestamp: new Date().toISOString(),
        failures: [],
      };

      return recordTestEvidence(workspaceRoot, "my-site", evidence, { releaseId: "r001" }).then(
        () =>
          verifyTestEvidence(workspaceRoot, "my-site", ["L4"], commitSha, {
            releaseId: "r001",
          }).then((result) => {
            expect(result.status).toBe("pass");
            expect(result.levels[0].found).toBe(true);
            expect(result.levels[0].passed).toBe(true);
            expect(result.levels[0].commitShaMatch).toBe(true);
          }),
      );
    });

    it("fails when evidence is missing", () => {
      return verifyTestEvidence(workspaceRoot, "my-site", ["L4", "L5"], "abc123", {
        releaseId: "r001",
      }).then((result) => {
        if (inGracePeriod) {
          expect(result.status).toBe("pass");
          expect(result.gracePeriod).toBe(true);
        } else {
          expect(result.status).toBe("fail");
        }
        expect(result.levels[0].found).toBe(false);
        expect(result.levels[1].found).toBe(false);
      });
    });

    it("fails when evidence has passed=false", () => {
      const evidence: TestEvidence = {
        testRunId: "run-001",
        level: "L5",
        targetId: "my-site",
        commitSha: "abc123",
        passed: false,
        durationMs: 3000,
        timestamp: new Date().toISOString(),
        failures: [{ testName: "smoke test", message: "500 status", file: "/health" }],
      };

      return recordTestEvidence(workspaceRoot, "my-site", evidence, { releaseId: "r001" }).then(
        () =>
          verifyTestEvidence(workspaceRoot, "my-site", ["L5"], "abc123", {
            releaseId: "r001",
          }).then((result) => {
            if (inGracePeriod) {
              expect(result.status).toBe("pass");
              expect(result.gracePeriod).toBe(true);
            } else {
              expect(result.status).toBe("fail");
            }
            expect(result.levels[0].found).toBe(true);
            expect(result.levels[0].passed).toBe(false);
          }),
      );
    });

    it("fails when commitSha does not match", () => {
      const evidence: TestEvidence = {
        testRunId: "run-001",
        level: "L4",
        targetId: "my-site",
        commitSha: "old-sha",
        passed: true,
        durationMs: 5000,
        timestamp: new Date().toISOString(),
        failures: [],
      };

      return recordTestEvidence(workspaceRoot, "my-site", evidence, { releaseId: "r001" }).then(
        () =>
          verifyTestEvidence(workspaceRoot, "my-site", ["L4"], "new-sha", {
            releaseId: "r001",
          }).then((result) => {
            if (inGracePeriod) {
              expect(result.status).toBe("pass");
              expect(result.gracePeriod).toBe(true);
            } else {
              expect(result.status).toBe("fail");
            }
            expect(result.levels[0].found).toBe(true);
            expect(result.levels[0].passed).toBe(true);
            expect(result.levels[0].commitShaMatch).toBe(false);
          }),
      );
    });
  });

  describe("listTestEvidence", () => {
    it("lists all evidence files sorted by level", () => {
      const baseTimestamp = new Date().toISOString();
      const l4Evidence: TestEvidence = {
        testRunId: "run-1",
        level: "L4",
        targetId: "my-site",
        commitSha: "abc123",
        passed: true,
        durationMs: 5000,
        timestamp: baseTimestamp,
        failures: [],
      };
      const l5Evidence: TestEvidence = {
        testRunId: "run-2",
        level: "L5",
        targetId: "my-site",
        commitSha: "abc123",
        passed: true,
        durationMs: 3000,
        timestamp: baseTimestamp,
        failures: [],
      };

      return Promise.all([
        recordTestEvidence(workspaceRoot, "my-site", l4Evidence, { releaseId: "r001" }),
        recordTestEvidence(workspaceRoot, "my-site", l5Evidence, { releaseId: "r001" }),
      ]).then(() =>
        listTestEvidence(workspaceRoot, "my-site", { releaseId: "r001" }).then((result) => {
          expect(result.evidence).toHaveLength(2);
          expect(result.evidence[0].level).toBe("L4");
          expect(result.evidence[1].level).toBe("L5");
        }),
      );
    });

    it("returns empty array when no evidence directory exists", () => {
      return listTestEvidence(workspaceRoot, "my-site", { releaseId: "r001" }).then((result) => {
        expect(result.evidence).toHaveLength(0);
      });
    });

    it("skips malformed JSON files", () => {
      const evidenceDir = join(workspaceRoot, "releases", "r001", ".test-evidence");
      mkdirSync(evidenceDir, { recursive: true });
      writeFileSync(join(evidenceDir, "L4.json"), "{ invalid json");

      return listTestEvidence(workspaceRoot, "my-site", { releaseId: "r001" }).then((result) => {
        expect(result.evidence).toHaveLength(0);
      });
    });
  });
});
