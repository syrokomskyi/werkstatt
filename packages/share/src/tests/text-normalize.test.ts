import { test, expect } from "vitest";
import {
  DEFAULT_NORMALIZE_CONFIG,
  SIGNAL_IDS,
  SIGNAL_REGISTRY,
  resolveNormalizeConfig,
  normalizeText,
  normalizeHtml,
  normalizeJson,
  normalizeXml,
  normalizeMarkdown,
  detectResidual,
  createDevNormalizeMiddleware,
  type NormalizeConfig,
} from "../text-normalize.ts";

// All special/invisible inputs use \u escapes so the test is canonical and the
// module's matchers must hit the real codepoints. Expected outputs are ASCII.
const ALL_ON = DEFAULT_NORMALIZE_CONFIG;

function only(id: (typeof SIGNAL_IDS)[number]): NormalizeConfig {
  const signals = {} as NormalizeConfig["signals"];
  for (const s of SIGNAL_IDS) signals[s] = s === id;
  return { enabled: true, signals };
}

// --- char signals -----------------------------------------------------------

test("dashes: every special dash becomes a hyphen, spaces preserved", () => {
  const input = "a—b — c–d‒e―f‑g−h";
  expect(normalizeText(input, ALL_ON)).toBe("a-b - c-d-e-f-g-h");
});

test("quotes: curly + guillemets become straight", () => {
  const input = "“hi” «yo» it’s ‘a’ „de“";
  expect(normalizeText(input, ALL_ON)).toBe(`"hi" "yo" it's 'a' "de"`);
});

test("ellipsis: single char becomes three dots", () => {
  expect(normalizeText("wait…", ALL_ON)).toBe("wait...");
});

test("spaces: nbsp and exotic spaces become a regular space (no collapsing)", () => {
  const input = "a b c d e　f g";
  expect(normalizeText(input, ALL_ON)).toBe("a b c d e f g");
});

test("zero-width cruft is removed", () => {
  const input = "a​b‌c⁠d﻿e­f؜g";
  expect(normalizeText(input, ALL_ON)).toBe("abcdefg");
});

test("ZWJ inside an emoji sequence is preserved; standalone ZWJ is stripped", () => {
  const family = "\u{1F469}‍\u{1F469}‍\u{1F466}"; // woman+woman+boy
  expect(normalizeText(family, ALL_ON)).toBe(family);
  expect(normalizeText("a‍b", ALL_ON)).toBe("ab");
});

// --- html entities -----------------------------------------------------------

test("typographic entities are decoded then normalized; structural entities survive", () => {
  const input = "A&mdash;B&nbsp;C&hellip; &amp; &lt;tag&gt; &quot;q&quot;";
  expect(normalizeText(input, ALL_ON)).toBe("A-B C... &amp; &lt;tag&gt; &quot;q&quot;");
});

test("numeric typographic entities decode; structural numeric entities do not", () => {
  // &#8212; = em dash (typographic) ; &#38; = & (structural)
  expect(normalizeText("x&#8212;y &#38; z", ALL_ON)).toBe("x-y &#38; z");
});

test("entity lens respects the dash toggle (decode keeps em-dash when dashes off)", () => {
  const cfg: NormalizeConfig = { enabled: true, signals: { ...ALL_ON.signals, dashes: false } };
  expect(normalizeText("a&mdash;b", cfg)).toBe("a—b");
});

// --- per-signal isolation ----------------------------------------------------

test("disabling spaces keeps nbsp while other signals still fire", () => {
  const cfg: NormalizeConfig = { enabled: true, signals: { ...ALL_ON.signals, spaces: false } };
  expect(normalizeText("a b—c", cfg)).toBe("a b-c");
});

test("master switch off is a no-op", () => {
  const off: NormalizeConfig = { enabled: false, signals: { ...ALL_ON.signals } };
  const input = "a—b“c”";
  expect(normalizeText(input, off)).toBe(input);
});

// --- html --------------------------------------------------------------------

test("html: text nodes normalized, code/script/pre skipped", () => {
  const input = "<p>he said “hi”—ok</p><code>a—b</code><pre>x—y</pre>";
  expect(normalizeHtml(input, ALL_ON)).toBe(`<p>he said "hi"-ok</p><code>a—b</code><pre>x—y</pre>`);
});

test("html: whitelisted attribute normalized and quote re-escaped", () => {
  const input = `<img alt="say “hi”" src="/x.png">`;
  expect(normalizeHtml(input, ALL_ON)).toBe(`<img alt="say &quot;hi&quot;" src="/x.png">`);
});

test("html: non-whitelisted attribute (href) is left untouched", () => {
  const input = `<a href="/a—b">t—t</a>`;
  expect(normalizeHtml(input, ALL_ON)).toBe(`<a href="/a—b">t-t</a>`);
});

test("html: inline JSON-LD string values normalized and stay valid JSON", () => {
  const input = '<script type="application/ld+json">{"name":"He said “hi”—ok"}</script>';
  const out = normalizeHtml(input, ALL_ON);
  const json = out.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "");
  const parsed = JSON.parse(json);
  expect(parsed.name).toBe(`He said "hi"-ok`);
});

// --- json --------------------------------------------------------------------

test("json: clean input returns byte-identical (no reformat)", () => {
  const input = '{"a":"plain","b":1}';
  expect(normalizeJson(input, ALL_ON)).toBe(input);
});

test("json: values normalized, keys untouched", () => {
  const out = normalizeJson('{"a\\u2014key":"v\\u2014v"}', ALL_ON);
  const parsed = JSON.parse(out);
  expect(Object.keys(parsed)).toEqual(["a—key"]);
  expect(parsed["a—key"]).toBe("v-v");
});

// --- xml ---------------------------------------------------------------------

test("xml: element text normalized, tags preserved", () => {
  expect(normalizeXml("<title>A—B</title>", ALL_ON)).toBe("<title>A-B</title>");
});

test("xml: CDATA body normalized as html", () => {
  const input = "<description><![CDATA[<p>a—b</p>]]></description>";
  expect(normalizeXml(input, ALL_ON)).toBe("<description><![CDATA[<p>a-b</p>]]></description>");
});

// --- markdown ----------------------------------------------------------------

test("markdown: prose normalized, fenced + inline code protected", () => {
  const input = "He—said\n```\nx—y\n```\nand `a—b` end";
  expect(normalizeMarkdown(input, ALL_ON)).toBe("He-said\n```\nx—y\n```\nand `a—b` end");
});

// --- CSS < in style block (regression) ---------------------------------------

test("html: CSS media query < in <style> does not trap the skip stack", () => {
  const input = "<style>@media (width<=768px){.x{color:red}}</style><p>a\u2014b</p>";
  expect(normalizeHtml(input, ALL_ON)).toBe(
    "<style>@media (width<=768px){.x{color:red}}</style><p>a-b</p>",
  );
});

test("html: text after <style> with CSS < is still normalized", () => {
  const input =
    "<style>.a{color:red}@media (width<=768px){.a{color:blue}}</style>" +
    '<span aria-label="Warpgogol \u2014 Home">link</span>' +
    "<p>\u0426\u0438\u0444\u0440\u043e\u0432\u0438\u0439 \u0444\u0443\u043d\u0434\u0430\u043c\u0435\u043d\u0442 \u2014 \u043f\u0440\u043e\u0434\u0443\u043a\u0442</p>";
  const out = normalizeHtml(input, ALL_ON);
  expect(out).toContain('aria-label="Warpgogol - Home"');
  expect(out).not.toContain("\u2014");
});

// --- idempotency -------------------------------------------------------------

test("all transforms are idempotent", () => {
  const html = `<p>“q”—<a title="t…">l</a></p>`;
  const once = normalizeHtml(html, ALL_ON);
  expect(normalizeHtml(once, ALL_ON)).toBe(once);
  const md = "a—b “c”…";
  const mdOnce = normalizeMarkdown(md, ALL_ON);
  expect(normalizeMarkdown(mdOnce, ALL_ON)).toBe(mdOnce);
});

// --- config resolution -------------------------------------------------------

test("resolveNormalizeConfig: absent block ⇒ all on", () => {
  expect(resolveNormalizeConfig({})).toEqual(ALL_ON);
  expect(resolveNormalizeConfig(null)).toEqual(ALL_ON);
});

test("resolveNormalizeConfig: explicit per-signal off respected, others default on", () => {
  const cfg = resolveNormalizeConfig({ text: { normalize: { signals: { spaces: false } } } });
  expect(cfg.enabled).toBe(true);
  expect(cfg.signals.spaces).toBe(false);
  expect(cfg.signals.dashes).toBe(true);
});

test("resolveNormalizeConfig: enabled:false honored", () => {
  const cfg = resolveNormalizeConfig({ text: { normalize: { enabled: false } } });
  expect(cfg.enabled).toBe(false);
});

// --- backstop detection ------------------------------------------------------

test("detectResidual: clean content returns null", () => {
  expect(detectResidual("<p>clean</p>", "html", ALL_ON)).toBe(null);
});

test("detectResidual: reports the responsible signal and a line", () => {
  const finding = detectResidual("line1\nse—cond", "txt", ALL_ON);
  expect(finding).toBeTruthy();
  expect(finding!.line).toBe(2);
  expect(finding!.signals).toEqual(["dashes"]);
});

// --- registry ----------------------------------------------------------------

test("SIGNAL_REGISTRY covers exactly the six signal ids", () => {
  expect(SIGNAL_REGISTRY.map((s) => s.id).sort()).toEqual([...SIGNAL_IDS].sort());
});

test("only() isolates a single signal", () => {
  expect(normalizeText("a—b“c”", only("dashes"))).toBe(`a-b“c”`);
});

// Codepoint-built inputs — independent of how source glyphs are stored, this proves
// the matchers hit the exact Unicode points named in the RFC (no false pass).
test("codepoints: spaces + zero-width matched by exact U+ value", () => {
  const cp = (...codes: number[]) => String.fromCodePoint(...codes);
  // U+00A0 U+2009 U+2003 U+202F U+3000 U+1680 U+205F all → single space
  const spaces = `a${cp(0x00a0)}b${cp(0x2009)}c${cp(0x2003)}d${cp(0x202f)}e${cp(0x3000)}f${cp(0x1680)}g${cp(0x205f)}h`;
  expect(normalizeText(spaces, ALL_ON)).toBe("a b c d e f g h");
  // U+200B U+200C U+2060 U+FEFF U+00AD U+061C U+2061 → removed
  const zw = `a${cp(0x200b)}b${cp(0x200c)}c${cp(0x2060)}d${cp(0xfeff)}e${cp(0x00ad)}f${cp(0x061c)}g${cp(0x2061)}h`;
  expect(normalizeText(zw, ALL_ON)).toBe("abcdefgh");
  // U+2014 em dash, U+201C/U+201D quotes, U+2026 ellipsis
  expect(normalizeText(`x${cp(0x2014)}y ${cp(0x201c)}z${cp(0x201d)}${cp(0x2026)}`, ALL_ON)).toBe(
    `x-y "z"...`,
  );
});

// --- dev middleware (RFC-0569) -----------------------------------------------

function makeResponse(body: string, contentType: string): Response {
  return new Response(body, { headers: { "content-type": contentType } });
}

test("dev middleware: enabled config normalizes HTML response", async () => {
  const mw = createDevNormalizeMiddleware(ALL_ON);
  const html = "<p>he said \u201chi\u201d\u2014ok</p>";
  const next = async () => makeResponse(html, "text/html; charset=utf-8");
  const res = await mw({} as any, next);
  if (!(res instanceof Response)) throw new Error("expected Response");
  const body = await res.text();
  expect(body).toBe(`<p>he said "hi"-ok</p>`);
});

test("dev middleware: disabled config is pass-through", async () => {
  const off: NormalizeConfig = { enabled: false, signals: { ...ALL_ON.signals } };
  const mw = createDevNormalizeMiddleware(off);
  const html = "<p>a\u2014b</p>";
  const next = async () => makeResponse(html, "text/html");
  const res = await mw({} as any, next);
  if (!(res instanceof Response)) throw new Error("expected Response");
  const body = await res.text();
  expect(body).toBe(html);
});

test("dev middleware: non-HTML response is pass-through", async () => {
  const mw = createDevNormalizeMiddleware(ALL_ON);
  const json = '{"a":"b\u2014c"}';
  const next = async () => makeResponse(json, "application/json");
  const res = await mw({} as any, next);
  if (!(res instanceof Response)) throw new Error("expected Response");
  const body = await res.text();
  expect(body).toBe(json);
});

test("dev middleware: try/catch falls back to original on error", async () => {
  const mw = createDevNormalizeMiddleware(ALL_ON);
  const html = "<p>valid</p>";
  let threw = false;
  const res = await mw({} as any, async () => {
    const r = makeResponse(html, "text/html");
    r.text = async () => {
      threw = true;
      throw new Error("simulated read error");
    };
    return r;
  });
  expect(threw).toBe(true);
  expect(res).toBeInstanceOf(Response);
});
