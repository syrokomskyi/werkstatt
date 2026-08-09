import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { validateRender } from "../render-validate.ts";

describe("video.render.validate", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "video-render-"));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it("fails when no render output exists (WV-03)", async () => {
    const result = await validateRender(projectRoot);

    expect(result.exitCode).toBe(1);
    expect(result.data?.status).toBe("fail");
    expect(result.data?.violations[0]!.ruleId).toBe("WV-03");
    expect(result.data?.violations[0]!.message).toContain("No render output");
  });

  it("fails when render hash baseline is missing (WV-03)", async () => {
    await mkdir(join(projectRoot, "dist"), { recursive: true });
    await writeFile(join(projectRoot, "dist", "output.mp4"), "fake-video");
    await writeFile(
      join(projectRoot, "editframe.config.ts"),
      `export default { codec: "h264", container: "mp4", resolution: "1920x1080" };\n`,
    );

    const result = await validateRender(projectRoot);

    expect(result.exitCode).toBe(1);
    const wv03 = result.data?.violations.find((v) => v.ruleId === "WV-03");
    expect(wv03).toBeDefined();
    expect(wv03!.message).toContain("baseline hash");
  });

  it("passes when render hash matches baseline (WV-03)", async () => {
    await mkdir(join(projectRoot, "dist"), { recursive: true });
    const videoContent = "fake-video-content";
    // Write hash-named file for WV-09 first, then compute baseline over all dist files
    const hash = createHash("sha256").update(videoContent).digest("hex");
    await writeFile(join(projectRoot, "dist", `${hash}.mp4`), videoContent);
    // Compute baseline hash the same way the build hook does: hash all files in dist (excluding .render-hash.json)
    const baselineHash = createHash("sha256")
      .update(videoContent) // hash-named file content
      .digest("hex");
    await writeFile(
      join(projectRoot, "dist", ".render-hash.json"),
      JSON.stringify({ hash: baselineHash, generatedAt: "2026-01-01T00:00:00.000Z" }),
    );
    await writeFile(
      join(projectRoot, "editframe.config.ts"),
      `export default { codec: "h264", container: "mp4", resolution: "1920x1080" };\n`,
    );

    const result = await validateRender(projectRoot);

    expect(result.exitCode).toBe(0);
    expect(result.data?.status).toBe("pass");
  });

  it("fails when render hash differs from baseline (WV-03)", async () => {
    await mkdir(join(projectRoot, "dist"), { recursive: true });
    await writeFile(join(projectRoot, "dist", "output.mp4"), "new-content");
    await writeFile(
      join(projectRoot, "dist", ".render-hash.json"),
      JSON.stringify({
        hash: "0000000000000000000000000000000000000000000000000000000000000000",
        generatedAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    await writeFile(
      join(projectRoot, "editframe.config.ts"),
      `export default { codec: "h264", container: "mp4", resolution: "1920x1080" };\n`,
    );

    const result = await validateRender(projectRoot);

    expect(result.exitCode).toBe(1);
    const wv03 = result.data?.violations.find((v) => v.ruleId === "WV-03");
    expect(wv03).toBeDefined();
    expect(wv03!.message).toContain("differs from baseline");
  });

  it("fails when editframe.config.ts is missing format declarations (WV-06)", async () => {
    await mkdir(join(projectRoot, "dist"), { recursive: true });
    const videoContent = "fake-video";
    await writeFile(join(projectRoot, "dist", "output.mp4"), videoContent);
    const hash = createHash("sha256").update(videoContent).digest("hex");
    await writeFile(
      join(projectRoot, "dist", ".render-hash.json"),
      JSON.stringify({ hash, generatedAt: "2026-01-01T00:00:00.000Z" }),
    );
    await writeFile(join(projectRoot, "dist", `${hash}.mp4`), videoContent);
    // Config missing codec, container, resolution
    await writeFile(join(projectRoot, "editframe.config.ts"), `export default {};\n`);

    const result = await validateRender(projectRoot);

    expect(result.exitCode).toBe(1);
    const wv06 = result.data?.violations.find((v) => v.ruleId === "WV-06");
    expect(wv06).toBeDefined();
  });

  it("fails when no content-addressed hash file in dist (WV-09)", async () => {
    await mkdir(join(projectRoot, "dist"), { recursive: true });
    const videoContent = "fake-video";
    await writeFile(join(projectRoot, "dist", "output.mp4"), videoContent);
    const hash = createHash("sha256").update(videoContent).digest("hex");
    await writeFile(
      join(projectRoot, "dist", ".render-hash.json"),
      JSON.stringify({ hash, generatedAt: "2026-01-01T00:00:00.000Z" }),
    );
    await writeFile(
      join(projectRoot, "editframe.config.ts"),
      `export default { codec: "h264", container: "mp4", resolution: "1920x1080" };\n`,
    );
    // No hash-named file — only "output.mp4"

    const result = await validateRender(projectRoot);

    expect(result.exitCode).toBe(1);
    const wv09 = result.data?.violations.find((v) => v.ruleId === "WV-09");
    expect(wv09).toBeDefined();
    expect(wv09!.message).toContain("content-addressed hash");
  });
});
