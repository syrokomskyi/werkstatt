import { describe, expect, it } from "vitest";
import { SHARE_I18N_TARGETS, scanShareI18nSource } from "../share-i18n.ts";

const materialTarget = SHARE_I18N_TARGETS.find(
  (target) => target.path === "packages/share/src/schemas/material-credit.ts",
);

function requireMaterialTarget(): (typeof SHARE_I18N_TARGETS)[number] {
  if (!materialTarget) throw new Error("Missing Material Credits share i18n target");
  return materialTarget;
}

describe("share.i18n.lint", () => {
  it("flags unclassified human-readable strings in a registered share helper", () => {
    const source = `
export const visibleCopy = "This should not live in a share helper.";
`;

    const violations = scanShareI18nSource(
      source,
      "packages/share/src/schemas/material-credit.ts",
      requireMaterialTarget(),
    );

    expect(violations).toMatchObject([
      {
        rule: "SHARE-I18N-01",
        severity: "error",
        excerpt: "This should not live in a share helper.",
      },
    ]);
  });

  it("flags Material Credits label maps in share helpers", () => {
    const source = `
const LABELS: Record<string, unknown> = {
  de: {
    summaryLabel: "Bildnachweis",
    pageTitle: "Bildnachweise",
  },
  uk: {
    summaryLabel: "Авторство матеріалів",
  },
};
`;

    const violations = scanShareI18nSource(
      source,
      "packages/share/src/schemas/material-credit.ts",
      requireMaterialTarget(),
    );

    expect(violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: "SHARE-I18N-02",
          severity: "error",
          excerpt: "Bildnachweis",
        }),
        expect.objectContaining({
          rule: "SHARE-I18N-02",
          severity: "error",
          excerpt: "Авторство матеріалів",
        }),
      ]),
    );
  });
});
