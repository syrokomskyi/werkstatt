import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateComposition } from "../composition-validate.ts";

describe("video.composition.validate", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "video-comp-"));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it("fails when composition entry point is missing (WV-08)", async () => {
    const result = await validateComposition(projectRoot);

    expect(result.exitCode).toBe(1);
    expect(result.data?.status).toBe("fail");
    expect(result.data?.violations).toHaveLength(1);
    expect(result.data?.violations[0]!.ruleId).toBe("WV-08");
  });

  it("fails when duration is missing (WV-01)", async () => {
    await mkdir(join(projectRoot, "src"), { recursive: true });
    await writeFile(
      join(projectRoot, "src", "composition.tsx"),
      `export default function Composition() { return null; }\n`,
    );

    const result = await validateComposition(projectRoot);

    expect(result.exitCode).toBe(1);
    expect(result.data?.status).toBe("fail");
    expect(result.data?.violations[0]!.ruleId).toBe("WV-01");
  });

  it("passes with valid duration and fps", async () => {
    await mkdir(join(projectRoot, "src"), { recursive: true });
    await writeFile(
      join(projectRoot, "src", "composition.tsx"),
      `<Timegroup duration="10s" fps={30} />\n`,
    );

    const result = await validateComposition(projectRoot);

    expect(result.exitCode).toBe(0);
    expect(result.data?.status).toBe("pass");
    expect(result.data?.violations).toHaveLength(0);
  });

  it("passes with valid duration in milliseconds", async () => {
    await mkdir(join(projectRoot, "src"), { recursive: true });
    await writeFile(
      join(projectRoot, "src", "composition.tsx"),
      `<Timegroup duration="5000ms" />\n`,
    );

    const result = await validateComposition(projectRoot);

    expect(result.exitCode).toBe(0);
    expect(result.data?.status).toBe("pass");
  });

  it("fails when fps is zero or negative (WV-01)", async () => {
    await mkdir(join(projectRoot, "src"), { recursive: true });
    await writeFile(
      join(projectRoot, "src", "composition.tsx"),
      `<Timegroup duration="10s" fps={0} />\n`,
    );

    const result = await validateComposition(projectRoot);

    expect(result.exitCode).toBe(1);
    expect(result.data?.violations[0]!.ruleId).toBe("WV-01");
    expect(result.data?.violations[0]!.message).toContain("fps");
  });
});
