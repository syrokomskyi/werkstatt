/*
<MODULE_CONTRACT>
<purpose>Server-side HTML post-processor that wraps qualifying inline numbers in prose HTML with GSAP-ready span elements. Zero DOM access — safe to call in Astro SSR/SSG frontmatter.</purpose>
<non-goals>
  <item>Do not import or call this from browser scripts — server-only.</item>
  <item>Do not wrap numbers inside h1–h4, code, pre, or existing js-inline-number spans.</item>
  <item>Do not use a full HTML parser — keep dependency-free.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0041: Created as SSR inline number pre-wrap utility in @warpgogol/share.</item>
</CHANGE_SUMMARY>
*/

// @ai-invariant: RFC-0041. Server-only. Never import in browser scripts.

export interface WrapInlineNumbersOptions {
  /** Also wrap year numbers (1200–currentYear+120). Default false — years are excluded by default. */
  animateYears?: boolean;
  /** GSAP tween duration in seconds written into data-duration. Default 3.0. */
  duration?: number;
}

// Matches integers ≥ 2 digits bounded by whitespace, punctuation, or string edges.
// Does NOT match:
//   - compound tokens: 14-jährig, 1st, e.V., 1.234 (trailing period or hyphen)
//   - paragraph refs:  § 53 (lookbehind excludes § via negative lookahead on the preceding char)
//   - registration IDs: VR 1520 BHV (uppercase-letter word before the number)
// Lookbehind: preceded by start-of-string OR whitespace/opening punctuation,
//             AND NOT immediately preceded by an uppercase letter sequence + space (abbrev/code)
// Lookahead:  followed by end-of-string OR whitespace/closing punctuation
const NUMBER_RE = /(?<=^|[\s(\[«"–—,;:!?])(\d{2,})(?=[\s).,;:!?»"–—]|$)/gm;

// Tags whose text content must not be wrapped.
const SKIP_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "code", "pre", "li", "ol"]);

/**
 * Splits an HTML string into alternating text and tag tokens.
 * Tags are strings starting with "<"; text segments are everything between tags.
 */
function tokenize(html: string): string[] {
  return html.split(/(<[^>]*>)/);
}

/**
 * Extracts the lowercase tag name from a tag token, e.g. "<h2 class=...>" → "h2".
 * Returns empty string for comments, doctypes, etc.
 */
function tagName(token: string): string {
  const m = token.match(/^<\/?([a-zA-Z][a-zA-Z0-9]*)/);
  return m ? m[1].toLowerCase() : "";
}

function isOpeningTag(token: string): boolean {
  return token.startsWith("<") && !token.startsWith("</") && !token.startsWith("<!--");
}

function isClosingTag(token: string): boolean {
  return token.startsWith("</");
}

/**
 * Accepts a rendered HTML string and returns the same string with qualifying
 * inline numbers wrapped in `<span class="js-inline-number" …>` elements.
 *
 * - Numbers inside h1–h4, code, pre, and existing js-inline-number spans are skipped.
 * - Year numbers (1200–currentYear+120) are always excluded (never wrapped).
 * - `animateYears` is reserved but currently treated as always false.
 * - Each span carries `style="display:inline;min-width:Nch"` to prevent CLS.
 */
export function wrapInlineNumbers(html: string, options: WrapInlineNumbersOptions = {}): string {
  const { animateYears = false, duration = 3.0 } = options;
  const currentYear = new Date().getFullYear();
  const isYear = (n: number) => n >= 1200 && n <= currentYear + 120;

  const tokens = tokenize(html);

  // Stack of tag names currently open (depth tracking to skip nested content)
  const skipStack: string[] = [];

  const result: string[] = [];

  for (const token of tokens) {
    if (token.startsWith("<")) {
      const name = tagName(token);

      if (isOpeningTag(token)) {
        if (SKIP_TAGS.has(name)) {
          skipStack.push(name);
        }
        // Also skip if we're entering a js-inline-number span (no double-wrap)
        if (name === "span" && token.includes("js-inline-number")) {
          skipStack.push("__inline-number__");
        }
      } else if (isClosingTag(token)) {
        const top = skipStack[skipStack.length - 1];
        if (top === name || (top === "__inline-number__" && name === "span")) {
          skipStack.pop();
        }
      }

      result.push(token);
      continue;
    }

    // Text segment — only wrap when not inside a skip context
    if (skipStack.length > 0) {
      result.push(token);
      continue;
    }

    const wrapped = token.replace(
      NUMBER_RE,
      (match, digits: string, offset: number, str: string) => {
        const num = parseInt(digits, 10);
        const digitCount = digits.length;
        const numIsYear = isYear(num);

        // Never wrap year numbers
        if (numIsYear) {
          return match;
        }

        // Skip numbers preceded by an uppercase-letter word + space: "VR 1520", "§ 53"
        // Look at the text before the match within the current segment
        const before = str.slice(0, offset);
        if (/(?:^|\s)(?:[A-ZÄÖÜ§]{1,}|[A-ZÄÖÜ][a-zäöü]*[A-ZÄÖÜ]+)\s$/.test(before)) {
          return match;
        }

        return `<span class="js-inline-number" data-numeric="${num}" data-duration="${duration}" style="display:inline;min-width:${digitCount}ch">${digits}</span>`;
      },
    );

    result.push(wrapped);
  }

  return result.join("");
}
