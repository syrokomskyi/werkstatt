import { test, expect, describe } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Regression guard: The section element's `id` attribute MUST be the bare
 * `sectionId` without any `sectionNumber` prefix. Prefixing breaks anchor
 * navigation because CTA hrefs use bare anchorId values (#recommendation-form).
 *
 * This bug was introduced and fixed twice (m000027 commit ca0e592e, m000040).
 * The test reads the .astro source and verifies the id expression does not
 * concatenate sectionNumber with sectionId.
 */
describe("section-shell anchor id invariant", () => {
  const astroSource = readFileSync(join(import.meta.dirname, "section-shell.astro"), "utf8");

  test("section id must not be prefixed with sectionNumber", () => {
    // The id attribute line should use sectionId directly, not `${sectionNumber}-${sectionId}`
    const idLine = astroSource.match(/id=\{([^}]+)\}/);
    expect(idLine, "section element must have an id attribute").toBeTruthy();
    const idExpression = idLine![1].trim();

    // Must NOT contain sectionNumber in the id expression
    expect(
      idExpression,
      `section id must not reference sectionNumber — got: "${idExpression}"`,
    ).not.toContain("sectionNumber");

    // Must reference sectionId
    expect(idExpression, `section id must reference sectionId — got: "${idExpression}"`).toContain(
      "sectionId",
    );
  });

  test("aria-labelledby may use sectionNumber prefix (heading uniqueness)", () => {
    const ariaLine = astroSource.match(/aria-labelledby=\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/s);
    expect(ariaLine, "section element must have aria-labelledby").toBeTruthy();
    // aria-labelledby SHOULD use sectionNumber prefix — this is correct
    expect(ariaLine![1]).toContain("sectionNumber");
  });
});
