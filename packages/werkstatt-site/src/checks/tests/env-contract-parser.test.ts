import { describe, it, expect } from "vitest";
import { parseEnvExample, checkEnvContract06 } from "../env/env-contract.ts";
import type { Diagnostic } from "@warpgogol/site-kernel";

const VALID_ENV_EXAMPLE = `# Header comment
# How to obtain: Example header

# ── Block 1
# How to obtain: Example instruction 1
KEY_ONE=

# ── Block 2
# How to obtain: Example instruction 2
KEY_TWO=
`;

const NO_BLANK_LINE_BETWEEN_BLOCKS = `# Header
# How to obtain: Example header

# ── Block 1
# How to obtain: Example instruction 1
KEY_ONE=
# ── Block 2
# How to obtain: Example instruction 2
KEY_TWO=
`;

const FIRST_VAR_NO_BLANK_LINE = `# Header
# How to obtain: Example header
KEY_ONE=

# ── Block 2
# How to obtain: Example instruction 2
KEY_TWO=
`;

describe("parseEnvExample (ENV-CONTRACT-06 regression)", () => {
  it("parses variables with correct comment association", () => {
    const vars = parseEnvExample(VALID_ENV_EXAMPLE);
    expect(vars).toHaveLength(2);
    expect(vars[0].key).toBe("KEY_ONE");
    expect(vars[0].hasComment).toBe(true);
    expect(vars[0].hasHowToObtain).toBe(true);
    expect(vars[1].key).toBe("KEY_TWO");
    expect(vars[1].hasComment).toBe(true);
    expect(vars[1].hasHowToObtain).toBe(true);
  });

  it("detects leading blank line before comment block (not before variable)", () => {
    const vars = parseEnvExample(VALID_ENV_EXAMPLE);
    // First var: no previous var, so hasLeadingBlankLine = false
    expect(vars[0].hasLeadingBlankLine).toBe(false);
    // Second var: blank line before comment block start
    expect(vars[1].hasLeadingBlankLine).toBe(true);
  });

  it("first variable after header comment has no leading blank line requirement", () => {
    const vars = parseEnvExample(FIRST_VAR_NO_BLANK_LINE);
    expect(vars).toHaveLength(2);
    expect(vars[0].hasLeadingBlankLine).toBe(false);
    expect(vars[1].hasLeadingBlankLine).toBe(true);
  });

  it("tracks commentBlockStartLine for each variable", () => {
    const vars = parseEnvExample(VALID_ENV_EXAMPLE);
    // KEY_ONE's comment block starts at line 3 (0-indexed: "# ── Block 1")
    expect(vars[0].commentBlockStartLine).toBeGreaterThanOrEqual(0);
    // KEY_TWO's comment block starts at a different line
    expect(vars[1].commentBlockStartLine).toBeGreaterThan(vars[0].commentBlockStartLine);
  });
});

describe("checkEnvContract06 (ENV-CONTRACT-06 regression)", () => {
  it("passes for valid .env.example with blank lines between blocks", () => {
    const diagnostics: Diagnostic[] = [];
    checkEnvContract06(VALID_ENV_EXAMPLE, "test/.env.example", diagnostics);
    expect(diagnostics).toHaveLength(0);
  });

  it("fails when blank line is missing between variable blocks", () => {
    const diagnostics: Diagnostic[] = [];
    checkEnvContract06(NO_BLANK_LINE_BETWEEN_BLOCKS, "test/.env.example", diagnostics);
    const blankLineErrors = diagnostics.filter((d) => d.message.includes("missing a blank line"));
    expect(blankLineErrors.length).toBeGreaterThan(0);
    // The error should reference KEY_TWO (the second variable block)
    expect(blankLineErrors[0].message).toContain("KEY_TWO");
  });

  it("does not flag the first variable for missing blank line", () => {
    const diagnostics: Diagnostic[] = [];
    checkEnvContract06(FIRST_VAR_NO_BLANK_LINE, "test/.env.example", diagnostics);
    const blankLineErrors = diagnostics.filter((d) => d.message.includes("missing a blank line"));
    // KEY_ONE is the first variable — no blank line required before it
    expect(blankLineErrors).toHaveLength(0);
  });
});
