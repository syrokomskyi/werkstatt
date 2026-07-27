import { describe, it, expect } from "vitest";
import { matchesForbiddenPhrase } from "../content-voice.ts";

describe("matchesForbiddenPhrase", () => {
  describe("single-token phrases (word-boundary matching)", () => {
    it('"hype" matches "too much hype here"', () => {
      expect(matchesForbiddenPhrase("too much hype here", "hype")).toBe(true);
    });

    it('"hype" does NOT match "rehype-parse" (RFC-0088 regression)', () => {
      expect(matchesForbiddenPhrase("rehype-parse", "hype")).toBe(false);
    });

    it('"hype" does NOT match "unhype"', () => {
      expect(matchesForbiddenPhrase("unhype", "hype")).toBe(false);
    });

    it('"günstig" matches "das ist günstig" (German umlaut)', () => {
      expect(matchesForbiddenPhrase("das ist günstig", "günstig")).toBe(true);
    });

    it('"günstig" does NOT match "ungünstig"', () => {
      expect(matchesForbiddenPhrase("ungünstig", "günstig")).toBe(false);
    });

    it('"cheap" does NOT match "cheaper", "cheapest", "cheapen"', () => {
      expect(matchesForbiddenPhrase("cheaper", "cheap")).toBe(false);
      expect(matchesForbiddenPhrase("cheapest", "cheap")).toBe(false);
      expect(matchesForbiddenPhrase("cheapen", "cheap")).toBe(false);
    });

    it('"hype" does NOT match inside "rehype" (rehype-in-hype audit regression)', () => {
      const openSourceAttribution =
        "licensed under mit. includes: rehype, rehype-parse, rehype-stringify.";
      expect(matchesForbiddenPhrase(openSourceAttribution, "hype")).toBe(false);
    });

    it("single token matches at string boundaries", () => {
      expect(matchesForbiddenPhrase("hype is bad", "hype")).toBe(true);
      expect(matchesForbiddenPhrase("too much hype", "hype")).toBe(true);
    });

    it("does not match inside underscore-separated words", () => {
      expect(matchesForbiddenPhrase("super_hype_thing", "hype")).toBe(false);
    });

    it("matches when surrounded by punctuation", () => {
      expect(matchesForbiddenPhrase("(hype) is bad", "hype")).toBe(true);
      expect(matchesForbiddenPhrase('"hype"', "hype")).toBe(true);
    });
  });

  describe("multi-word phrases (substring matching)", () => {
    it('"ROI-garantiert" matches as substring', () => {
      expect(matchesForbiddenPhrase("das ist roi-garantiert", "ROI-garantiert")).toBe(true);
    });

    it('"ROI-garantiert" does NOT match inside a compound word', () => {
      expect(matchesForbiddenPhrase("groi-garantiert", "ROI-garantiert")).toBe(false);
    });

    it('"von 1 €/Tag" matches as substring (whitespace-bearing)', () => {
      expect(matchesForbiddenPhrase("nur von 1 €/tag", "von 1 €/Tag")).toBe(true);
    });

    it("multi-word phrase with spaces uses substring match", () => {
      expect(matchesForbiddenPhrase("some text about cheap stuff", "cheap stuff")).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("empty phrase returns false", () => {
      expect(matchesForbiddenPhrase("anything", "")).toBe(false);
    });

    it("whitespace-only phrase returns false", () => {
      expect(matchesForbiddenPhrase("anything", "   ")).toBe(false);
    });

    it("phrase with regex metacharacters is handled safely", () => {
      expect(matchesForbiddenPhrase("price (per unit)", "(per unit)")).toBe(true);
    });

    it("mixed case phrase matches case-insensitively", () => {
      expect(matchesForbiddenPhrase("too much hype here", "HYPE")).toBe(true);
    });

    it("phrase with leading/trailing whitespace is trimmed", () => {
      expect(matchesForbiddenPhrase("too much hype here", "  hype  ")).toBe(true);
    });

    it("phrases with question marks are handled correctly", () => {
      expect(matchesForbiddenPhrase("what the hype?", "hype")).toBe(true);
    });

    it("phrase with dollar sign is escaped correctly", () => {
      expect(matchesForbiddenPhrase("cost $100 today", "$100")).toBe(true);
    });
  });
});
