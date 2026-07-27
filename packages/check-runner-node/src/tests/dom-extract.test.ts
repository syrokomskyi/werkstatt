import { test, expect, describe, beforeEach } from "vitest";
import { extractPageEvidenceFromDOM } from "../dom-extract.ts";

function setDocument(html: string): void {
  document.documentElement.innerHTML = html;
}

describe("extractPageEvidenceFromDOM", () => {
  beforeEach(() => {
    document.documentElement.innerHTML = "";
    document.title = "";
  });

  test("extracts page title", () => {
    document.title = "Test Page";
    const evidence = extractPageEvidenceFromDOM();
    expect(evidence.title).toBe("Test Page");
  });

  test("extracts lang attribute", () => {
    document.documentElement.lang = "de";
    const evidence = extractPageEvidenceFromDOM();
    expect(evidence.lang).toBe("de");
  });

  test("extracts canonical link", () => {
    setDocument('<head><link rel="canonical" href="https://example.com/page"></head>');
    const evidence = extractPageEvidenceFromDOM();
    expect(evidence.canonical).toBe("https://example.com/page");
  });

  test("extracts meta description", () => {
    setDocument('<head><meta name="description" content="Test description"></head>');
    const evidence = extractPageEvidenceFromDOM();
    expect(evidence.metaDescription).toBe("Test description");
  });

  test("extracts sections with headings", () => {
    setDocument(`
      <body>
        <main>
          <section id="hero"><h1>Welcome</h1><p>Hello world</p></section>
          <section id="about"><h2>About Us</h2><p>We are here</p></section>
        </main>
      </body>
    `);
    const evidence = extractPageEvidenceFromDOM();
    expect(evidence.sections.length).toBeGreaterThanOrEqual(2);
    const hero = evidence.sections.find((s) => s.id === "hero");
    expect(hero).toBeTruthy();
    expect(hero!.heading).toBe("Welcome");
    expect(hero!.anchor).toBe("#hero");
    const about = evidence.sections.find((s) => s.id === "about");
    expect(about!.heading).toBe("About Us");
  });

  test("section without id gets generated id", () => {
    setDocument("<body><main><section><h1>No ID</h1></section></main></body>");
    const evidence = extractPageEvidenceFromDOM();
    const section = evidence.sections[0];
    expect(section).toBeTruthy();
    expect(section!.id).toBe("section-1");
    expect(section!.anchor).toBeUndefined();
  });

  test("extracts links", () => {
    setDocument(
      '<body><a href="https://a.com">A</a><a href="/page">Page</a><a href="">Empty</a></body>',
    );
    const evidence = extractPageEvidenceFromDOM();
    expect(evidence.links.length).toBeGreaterThanOrEqual(2);
  });

  test("extracts body text", () => {
    setDocument("<body><p>Hello World</p></body>");
    const evidence = extractPageEvidenceFromDOM();
    expect(evidence.text).toContain("Hello World");
  });

  test("returns undefined for missing title", () => {
    document.title = "";
    const evidence = extractPageEvidenceFromDOM();
    expect(evidence.title).toBeUndefined();
  });

  test("returns undefined for missing lang", () => {
    document.documentElement.lang = "";
    const evidence = extractPageEvidenceFromDOM();
    expect(evidence.lang).toBeUndefined();
  });

  test("section text is whitespace-normalized", () => {
    setDocument(
      "<body><main><section id='s'><p>Multiple   spaces\n\n   and newlines</p></section></main></body>",
    );
    const evidence = extractPageEvidenceFromDOM();
    const section = evidence.sections.find((s) => s.id === "s");
    expect(section!.text).not.toContain("\n");
    expect(section!.text).not.toContain("  ");
  });
});
