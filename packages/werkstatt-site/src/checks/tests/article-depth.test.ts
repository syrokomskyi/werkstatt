import { describe, it, expect } from "vitest";
import { articleDepthDiagnostic, countWords, findThinSections } from "../article-depth.ts";

describe("countWords", () => {
  it("counts plain prose words", () => {
    expect(countWords("Dies ist ein Satz mit sieben Wörtern.")).toBe(7);
  });

  it("returns 0 for undefined or empty text", () => {
    expect(countWords(undefined)).toBe(0);
    expect(countWords("")).toBe(0);
    expect(countWords("   \n  \n ")).toBe(0);
  });

  it("counts GFM table cell content without inflating on pipe/separator noise", () => {
    const table = [
      "| Kostenart | Betrag |",
      "| --- | --- |",
      "| Einmalig | 200 Euro |",
      "| Laufend | 70 Euro |",
    ].join("\n");
    // "Kostenart", "Betrag", "Einmalig", "200", "Euro", "Laufend", "70", "Euro" = 8 words;
    // the separator row and pipe characters contribute nothing.
    expect(countWords(table)).toBe(8);
  });

  it("strips heading markers and list/checklist bullets before counting", () => {
    expect(countWords("## Eine Überschrift")).toBe(2);
    expect(countWords("- [ ] Ein Punkt\n- [x] Noch einer")).toBe(4);
  });

  it("meets the 500-word floor for a realistic multi-paragraph article body", () => {
    const paragraph =
      "Diese Website bietet transparente Preise, klare Eigentumsverhältnisse und einen " +
      "nachvollziehbaren Ausstieg für jeden Kunden, der eine langfristige Zusammenarbeit sucht. ";
    const body = paragraph.repeat(40); // well over 500 words
    expect(countWords(body)).toBeGreaterThanOrEqual(500);
  });
});

describe("findThinSections", () => {
  it("returns no thin sections when every H2 has substantive content", () => {
    const body = [
      "## Erste Überschrift",
      "",
      "Dies ist ein vollständiger Absatz mit ausreichend Substanz unter der Überschrift, der die Mindestwortzahl klar überschreitet.",
      "",
      "## Zweite Überschrift",
      "",
      "Auch dieser Abschnitt enthält einen echten, ausführlichen Absatz statt nur einer knappen Überschrift ohne Inhalt.",
    ].join("\n");
    expect(findThinSections(body)).toEqual([]);
    expect(findThinSections(body).length).toBe(0);
  });

  it("flags a heading with no content beneath it", () => {
    const body = [
      "## Echte Überschrift",
      "",
      "Ein vollständiger Absatz mit ausreichend Substanz, der die Mindestwortzahl deutlich überschreitet.",
      "",
      "## Leere Überschrift",
      "",
      "## Nächste Überschrift",
      "",
      "Noch ein vollständiger Absatz mit ausreichend Substanz, der die Mindestwortzahl deutlich überschreitet.",
    ].join("\n");
    expect(findThinSections(body)).toEqual(["Leere Überschrift"]);
    const failure = { exitCode: findThinSections(body).length };
    expect(failure.exitCode).toBe(1);
  });

  it("flags a heading followed only by a short filler phrase", () => {
    const body = ["## Kurzabschnitt", "", "Zu kurz."].join("\n");
    expect(findThinSections(body)).toEqual(["Kurzabschnitt"]);
  });

  it("returns an empty array for undefined body text", () => {
    expect(findThinSections(undefined)).toEqual([]);
  });

  it("maps article depth violation strings to diagnostic rule ids", () => {
    expect(articleDepthDiagnostic("ART-DEPTH-02: article is too short")).toMatchObject({
      ruleId: "ART-DEPTH-02",
      severity: "error",
      message: "article is too short",
    });
  });
});
