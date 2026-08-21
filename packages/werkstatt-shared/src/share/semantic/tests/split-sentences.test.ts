import { describe, expect, it } from "vitest";
import { splitSentences } from "@warpgogol/werkstatt-shared/share/semantic";

describe("splitSentences", () => {
  it("splits simple English sentences", () => {
    const result = splitSentences("Hello world. This is a test. Goodbye!", "en");
    expect(result).toHaveLength(3);
    expect(result[0]).toBe("Hello world.");
    expect(result[1]).toBe("This is a test.");
    expect(result[2]).toBe("Goodbye!");
  });

  it("handles German abbreviations", () => {
    const result = splitSentences("Das ist z.B. ein Test. Das ist ein weiterer Satz.", "de");
    expect(result).toHaveLength(2);
    expect(result[0]).toBe("Das ist z.B. ein Test.");
    expect(result[1]).toBe("Das ist ein weiterer Satz.");
  });

  it("handles English abbreviations", () => {
    const result = splitSentences("Use e.g. this pattern. It works well.", "en");
    expect(result).toHaveLength(2);
    expect(result[0]).toBe("Use e.g. this pattern.");
    expect(result[1]).toBe("It works well.");
  });

  it("handles Ukrainian text", () => {
    const result = splitSentences("Це перше речення. Це друге речення.", "uk");
    expect(result).toHaveLength(2);
  });

  it("returns empty array for empty input", () => {
    expect(splitSentences("", "en")).toEqual([]);
    expect(splitSentences("   ", "en")).toEqual([]);
  });

  it("handles single sentence without terminal punctuation", () => {
    const result = splitSentences("Just some text without ending", "en");
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("Just some text without ending");
  });

  it("does not split on decimal numbers", () => {
    const result = splitSentences("The price is 3.50 euros. That is cheap.", "en");
    expect(result).toHaveLength(2);
    expect(result[0]).toBe("The price is 3.50 euros.");
    expect(result[1]).toBe("That is cheap.");
  });

  it("does not split on URLs in Ukrainian text", () => {
    const result = splitSentences(
      "Дивіться https://my.raceresult.com/317721/results для деталей. Це друге речення.",
      "uk",
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toBe("Дивіться https://my.raceresult.com/317721/results для деталей.");
    expect(result[1]).toBe("Це друге речення.");
  });

  it("does not split on URLs in German text", () => {
    const result = splitSentences(
      "Siehe https://my.raceresult.com/317721/results für Details. Das ist ein zweiter Satz.",
      "de",
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toBe("Siehe https://my.raceresult.com/317721/results für Details.");
    expect(result[1]).toBe("Das ist ein zweiter Satz.");
  });

  it("splits at period before German umlaut", () => {
    const result = splitSentences(
      "Die Version wird festgehalten. Änderungen erfolgen gemäß § 15.",
      "de",
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toBe("Die Version wird festgehalten.");
    expect(result[1]).toBe("Änderungen erfolgen gemäß § 15.");
  });

  it("does not split at numbered list markers", () => {
    const result = splitSentences(
      "1. Vorlage eines konkreten Angebots durch das Studio; 2. ausdrücklicher Annahme des Angebots durch den Kunden; 3. Auftragsbestätigung durch das Studio zustande.",
      "de",
    );
    expect(result).toHaveLength(1);
  });

  it("handles spaced German abbreviation z. B.", () => {
    const result = splitSentences(
      "Das Studio kann nicht wesentliche Prozesse (z. B. Werkzeuge) ändern. Der wesentliche Leistungsumfang kann nicht einseitig geändert werden.",
      "de",
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toBe("Das Studio kann nicht wesentliche Prozesse (z. B. Werkzeuge) ändern.");
    expect(result[1]).toBe("Der wesentliche Leistungsumfang kann nicht einseitig geändert werden.");
  });
});
