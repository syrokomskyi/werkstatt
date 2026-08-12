/*
<MODULE_CONTRACT>
<purpose>
  RFC-0811: shared pattern-matching utilities for generator ownership map
  path resolution. Extracted from generated-file-lookup.ts and
  generated-edit-guard.ts to eliminate triplicated copies of toPosix,
  segmentToRegexSource, ownPatternToExactRegex, normalizeOwnershipPath,
  expandPlaceholderVariants, and matchOwnershipEntry. Also provides
  isFileOwnedByCommand for command-scoped whitelist filtering.
</purpose>
<non-goals>
  <item>gitattributes.ts retains its own expandPlaceholderVariants because its recursive variant construction differs.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0811: initial extraction from generated-file-lookup.ts and generated-edit-guard.ts.</item>
  <item>RFC-0811: add isFileOwnedByCommand for whitelist filtering in page.markdown.validate.</item>
</CHANGE_SUMMARY>
*/
import { GENERATOR_OWNERSHIP_MAP, type OwnershipEntry } from "./generator-ownership.ts";

export function toPosix(path: string): string {
  return path.replace(/\\/g, "/");
}

export function segmentToRegexSource(segment: string): string {
  return segment
    .split("*")
    .map((literal) => literal.replace(/[.+^${}()|[\]\\]/g, "\\$&"))
    .join("[^/]*");
}

export function ownPatternToExactRegex(pattern: string): RegExp {
  const segments = pattern.split("/").filter((s) => s.length > 0);
  const pieces: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    pieces.push(
      seg === "**" ? (i === segments.length - 1 ? ".*" : "(?:[^/]+/)*") : segmentToRegexSource(seg),
    );
  }
  let source = "^";
  for (let i = 0; i < pieces.length; i++) {
    source += pieces[i];
    const isRecursiveNonLast = segments[i] === "**" && i !== segments.length - 1;
    if (i < pieces.length - 1 && !isRecursiveNonLast) source += "/";
  }
  return new RegExp(`${source}$`);
}

export function normalizeOwnershipPath(rawPath: string): string {
  const pattern = rawPath.replace(/\\/g, "/");
  if (
    pattern.startsWith("packages/") ||
    pattern.startsWith("docs/") ||
    pattern.startsWith("apps/")
  ) {
    return pattern;
  }
  return `apps/*/${pattern}`;
}

export function expandPlaceholderVariants(pattern: string): string[] {
  const segments = pattern.split("/");
  const wholeSegmentPlaceholder = (seg: string): boolean => /^\{[a-zA-Z0-9_]+\}$/.test(seg);
  const embeddedPlaceholder = (seg: string): boolean =>
    /\{[a-zA-Z0-9_]+\}/.test(seg) && !wholeSegmentPlaceholder(seg);

  const direct = segments
    .map((seg) => (wholeSegmentPlaceholder(seg) ? "**" : seg.replace(/\{[a-zA-Z0-9_]+\}/g, "*")))
    .join("/");

  const hasEmbedded = segments.some(embeddedPlaceholder);
  if (!hasEmbedded) return [direct];

  const recursive = segments
    .map((seg) => (wholeSegmentPlaceholder(seg) ? "**" : seg.replace(/\{[a-zA-Z0-9_]+\}/g, "**")))
    .join("/");
  return [direct, recursive];
}

export function matchOwnershipEntry(relPath: string, app?: string): OwnershipEntry | null {
  const posixPath = toPosix(relPath);

  for (const entry of GENERATOR_OWNERSHIP_MAP) {
    const normalized = normalizeOwnershipPath(entry.path);
    const variants = expandPlaceholderVariants(normalized);

    for (const variant of variants) {
      const regex = ownPatternToExactRegex(variant);
      if (regex.test(posixPath)) {
        return entry;
      }
    }

    if (app) {
      const appPrefixed = `apps/${app}/${entry.path}`;
      const appNormalized = normalizeOwnershipPath(appPrefixed);
      const appVariants = expandPlaceholderVariants(appNormalized);
      for (const variant of appVariants) {
        const regex = ownPatternToExactRegex(variant);
        if (regex.test(posixPath)) {
          return entry;
        }
      }
    }
  }

  return null;
}

export function isFileOwnedByCommand(relPath: string, command: string, app?: string): boolean {
  const posixPath = toPosix(relPath);
  let matchesCommand = false;

  for (const entry of GENERATOR_OWNERSHIP_MAP) {
    const normalized = normalizeOwnershipPath(entry.path);
    const variants = expandPlaceholderVariants(normalized);

    let matches = false;
    for (const variant of variants) {
      const regex = ownPatternToExactRegex(variant);
      if (regex.test(posixPath)) {
        matches = true;
        break;
      }
    }

    if (!matches && app) {
      const appPrefixed = `apps/${app}/${entry.path}`;
      const appNormalized = normalizeOwnershipPath(appPrefixed);
      const appVariants = expandPlaceholderVariants(appNormalized);
      for (const variant of appVariants) {
        const regex = ownPatternToExactRegex(variant);
        if (regex.test(posixPath)) {
          matches = true;
          break;
        }
      }
    }

    if (matches) {
      if (entry.command === command) {
        matchesCommand = true;
      } else {
        return false;
      }
    }
  }

  return matchesCommand;
}
