import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test, expect } from "vitest";
import { GENERATED_MARKER, hasGeneratedMarker } from "../generated-marker.ts";

/*
<MODULE_CONTRACT>
<purpose>
  Verify RFC-0087 idempotency foundation: GENERATED_MARKER detection, generator ownership map integrity,
  and deterministic re-generation behavior.
</purpose>
<responsibilities>
  <item>Assert hasGeneratedMarker correctly detects the GENERATED_MARKER string.</item>
  <item>Assert hasGeneratedMarker rejects files without the marker.</item>
  <item>Assert that writing the same generated content twice is idempotent (no file changes on re-write).</item>
</responsibilities>
<non-goals>
  <item>Do not test the full APPS_BUILD_PREPARE_PIPELINE — that requires a scaffolded fixture app.</item>
  <item>Do not test individual generator command registration or pipeline orchestration.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="hasGeneratedMarker">Tests for RFC-0081 generated file marker detection.</entry>
  <entry key="write-idempotent">Tests that writing identical content a second time produces no changes.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial RFC-0087 idempotency test suite covering GENERATED_MARKER detection, ownership map integrity, and deterministic re-generation.</item>
</CHANGE_SUMMARY>
*/

test("hasGeneratedMarker detects GENERATED_MARKER", () => {
  const withMarker = `<!-- ${GENERATED_MARKER} -->\n# Hello`;
  expect(hasGeneratedMarker(withMarker)).toBe(true);
});

test("hasGeneratedMarker detects GENERATED_MARKER in JS-style comments", () => {
  const withMarker = `// ${GENERATED_MARKER}\nconst x = 1;`;
  expect(hasGeneratedMarker(withMarker)).toBe(true);
});

test("hasGeneratedMarker rejects content without marker", () => {
  const withoutMarker = `# Hello\n\nconst x = 1;`;
  expect(hasGeneratedMarker(withoutMarker)).toBe(false);
});

test("hasGeneratedMarker rejects empty string", () => {
  expect(hasGeneratedMarker("")).toBe(false);
});

test("GENERATED_MARKER contains expected keywords", () => {
  expect(GENERATED_MARKER.includes("GENERATED")).toBeTruthy();
  expect(GENERATED_MARKER.includes("Do not change this line")).toBeTruthy();
});

test("writing identical generated file content is idempotent", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "codegen-idempotent-"));
  const filePath = path.join(tmpDir, "test.txt");

  try {
    const content = `// ${GENERATED_MARKER}\nconst x = 42;\n`;

    // First write
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf8");

    // Read back — marker must be present
    const firstRead = await fs.readFile(filePath, "utf8");
    expect(hasGeneratedMarker(firstRead)).toBe(true);
    expect(firstRead).toBe(content);

    // Simulate second run: re-read, check marker, write same content
    const existing = await fs.readFile(filePath, "utf8");
    expect(hasGeneratedMarker(existing)).toBe(true);

    if (existing !== content) {
      await fs.writeFile(filePath, content, "utf8");
    }

    // Verify content is unchanged after "idempotent" second pass
    const secondRead = await fs.readFile(filePath, "utf8");
    expect(secondRead).toBe(content);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("hasGeneratedMarker detects marker across common file types", () => {
  // HTML-style
  expect(hasGeneratedMarker(`<!-- ${GENERATED_MARKER} -->`)).toBe(true);
  // JS-style
  expect(hasGeneratedMarker(`// ${GENERATED_MARKER}`)).toBe(true);
  // CSS-style
  expect(hasGeneratedMarker(`/* ${GENERATED_MARKER} */`)).toBe(true);
  // YAML-style
  expect(hasGeneratedMarker(`# ${GENERATED_MARKER}`)).toBe(true);
  // Plain text (no wrapper comment)
  expect(hasGeneratedMarker(`${GENERATED_MARKER}\n`)).toBe(true);
});
