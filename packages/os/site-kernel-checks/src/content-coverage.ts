/*
<MODULE_CONTRACT>
<purpose>Implements RFC-0073 content.coverage.validate for atom placement coverage against authored content.</purpose>
<non-goals>
  <item>Do not perform fuzzy semantic matching beyond exact-after-normalization comparison.</item>
  <item>Do not synthesize or rewrite missing content.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0073: Add atom coverage validator with onboarding artifact awareness.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  flattenStringValues,
  getContentDisciplinePaths,
  collectMarkdownFilesSafe,
  readMarkdownDocument,
  pathExists,
} from "./content-discipline.ts";
import {
  normalizeComparableText,
  parseContentAtomsFile,
  parseCoverageLedgerMarkdown,
} from "@gogol/share/content-discipline";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";

export async function runContentCoverageValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = getContentDisciplinePaths(context);
  // Per-app atom coverage: atoms.yaml is authored for one client and must only be
  // validated against that client's app. Resolution mirrors content.voice.lint:
  //   1. App-local committed atoms: <app>/.author/atoms.yaml
  //   2. Shared onboarding staging output, but ONLY when its `client` matches the
  //      current app name (the staging dir holds a single in-flight run at a time).
  // Without this guard an already-onboarded app would be checked against another
  // client's atoms (e.g. webgogol-com's atom-0001..N counted as unplaced in
  // nicaragua-projekt).
  const siteName = context.site?.name ?? "";
  const appLocalAuthorDir = join(paths.appDirectory, ".author");
  const appLocalAtomsPath = join(appLocalAuthorDir, "atoms.yaml");
  const useAppLocal = await pathExists(appLocalAtomsPath);
  const authorDir = useAppLocal ? appLocalAuthorDir : paths.onboardingAuthorDirectory;
  const atomsPath = join(authorDir, "atoms.yaml");
  const coveragePath = join(authorDir, "coverage.md");

  if (!(await pathExists(atomsPath))) {
    return {
      exitCode: 0,
      data: {
        command: "content.coverage.validate",
        status: "pass",
        violations: [],
        skipped: true,
      },
      summary: "content.coverage.validate: skipped (no onboarding/.output/04-author/atoms.yaml)",
    };
  }

  const atomsFile = parseContentAtomsFile(await readFile(atomsPath, "utf8"));
  // Shared staging atoms apply only to the client they were authored for.
  if (!useAppLocal && atomsFile.client !== siteName) {
    return {
      exitCode: 0,
      data: {
        command: "content.coverage.validate",
        status: "pass",
        violations: [],
        skipped: true,
      },
      summary: `content.coverage.validate: skipped (staging atoms target client ${atomsFile.client}, not ${siteName})`,
    };
  }
  const coverageEntries = (await pathExists(coveragePath))
    ? parseCoverageLedgerMarkdown(await readFile(coveragePath, "utf8"))
    : [];
  const declaredUnplaced = new Map(coverageEntries.map((entry) => [entry.atomId, entry]));
  const duplicateIds = new Set<string>();
  const seenIds = new Set<string>();
  for (const atom of atomsFile.atoms) {
    if (seenIds.has(atom.id)) {
      duplicateIds.add(atom.id);
    }
    seenIds.add(atom.id);
  }

  const violations: string[] = [];
  if (duplicateIds.size > 0) {
    for (const id of duplicateIds) {
      violations.push(`atoms.yaml — duplicate atom id ${id}`);
    }
  }

  const directories = [
    paths.pagesDirectory,
    paths.proseDirectory,
    paths.businessDirectory,
    join(paths.contentDirectory, "faq"),
  ];
  const files = (
    await Promise.all(directories.map((directory) => collectMarkdownFilesSafe(directory)))
  ).flat();
  const normalizedCorpus = new Set<string>();

  for (const filePath of files) {
    const doc = await readMarkdownDocument(context.workspaceRoot, filePath);
    for (const entry of flattenStringValues(doc.frontmatter)) {
      const normalized = normalizeComparableText(entry.value);
      if (normalized) normalizedCorpus.add(normalized);
    }
    const normalizedBody = normalizeComparableText(doc.body);
    if (normalizedBody) normalizedCorpus.add(normalizedBody);
  }

  for (const atom of atomsFile.atoms) {
    const normalizedAtom = normalizeComparableText(atom.text);
    const placed = normalizedCorpus.has(normalizedAtom);
    if (placed) {
      continue;
    }
    if (!declaredUnplaced.has(atom.id)) {
      violations.push(`${atom.id} — unplaced atom with no coverage.md rationale`);
    }
  }

  return {
    exitCode: violations.length > 0 ? 1 : 0,
    data: {
      command: "content.coverage.validate",
      status: violations.length > 0 ? "fail" : "pass",
      violations,
      atoms: atomsFile.atoms.length,
      declaredUnplaced: coverageEntries.length,
    },
    summary:
      violations.length > 0
        ? `content.coverage.validate: ${violations.length} violation(s)`
        : `content.coverage.validate: OK (${atomsFile.atoms.length} atoms checked)`,
  };
}
