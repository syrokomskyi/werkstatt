import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createServer, type Server } from "node:http";

import { runMissionCheck } from "../mission-check.ts";
import { makeTestContext, testInput } from "./helpers.ts";

async function createMockMission(workspaceRoot: string, missionId: string): Promise<string> {
  const missionDir = join(workspaceRoot, "missions", missionId);
  const workpieceDir = join(missionDir, "workpiece");
  const distDir = join(workpieceDir, "dist", "client");

  await mkdir(distDir, { recursive: true });
  await mkdir(join(missionDir, "evidence"), { recursive: true });

  // Minimal HTML page
  await writeFile(
    join(distDir, "index.html"),
    "<html><head></head><body><h1>Test Page</h1></body></html>",
    "utf-8",
  );

  // Sitemap
  await writeFile(
    join(distDir, "sitemap.xml"),
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url><loc>{BASE_URL}/</loc></url>\n</urlset>',
    "utf-8",
  );

  // Mission manifest
  await writeFile(
    join(missionDir, "mission.yaml"),
    `missionId: ${missionId}\nsystemId: test-system\nstate: open\noperationId: op-1\n`,
    "utf-8",
  );

  return missionDir;
}

async function startTempServer(rootDir: string): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer(async (req, res) => {
    try {
      const urlPath = req.url ?? "/";
      const filePath = join(rootDir, urlPath === "/" ? "index.html" : urlPath);
      const content = await readFile(filePath);
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end("Not Found");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

describe("mission.check", () => {
  it("returns exit code 7 when sitemap.xml is missing", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mission-check-test-"));
    const missionId = "test-m000001";
    const missionDir = await createMockMission(workspaceRoot, missionId);
    const distDir = join(missionDir, "workpiece", "dist", "client");

    // Remove sitemap to trigger exit code 7
    await rm(join(distDir, "sitemap.xml"));

    // Start a temp server serving dist without sitemap
    const { server, baseUrl } = await startTempServer(distDir);
    try {
      const result = await runMissionCheck(
        { flags: { mission: missionId, "external-preview": true, "base-url": baseUrl }, argv: [] },
        makeTestContext(workspaceRoot),
      );

      expect(result.exitCode).toBe(7);
      expect(result.summary).toContain("sitemap");
    } finally {
      server.close();
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("returns exit code 6 when workpiece dist is missing", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mission-check-test-"));
    try {
      const missionId = "test-m000002";
      const missionDir = await createMockMission(workspaceRoot, missionId);

      // Remove dist to trigger build failure path
      await rm(join(missionDir, "workpiece", "dist"), { recursive: true, force: true });

      const result = await runMissionCheck(
        { flags: { mission: missionId }, argv: [] },
        makeTestContext(workspaceRoot),
      );

      // Build will fail since there's no astro project
      expect(result.exitCode).toBe(6);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("throws when --mission is missing", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mission-check-test-"));
    try {
      await expect(runMissionCheck(testInput(), makeTestContext(workspaceRoot))).rejects.toThrow(
        "mission",
      );
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("throws when --external-preview is set without --base-url", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mission-check-test-"));
    try {
      const missionId = "test-m000003";
      await createMockMission(workspaceRoot, missionId);

      await expect(
        runMissionCheck(
          { flags: { mission: missionId, "external-preview": true }, argv: [] },
          makeTestContext(workspaceRoot),
        ),
      ).rejects.toThrow("base-url");
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});
