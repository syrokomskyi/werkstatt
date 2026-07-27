/*
<MODULE_CONTRACT>
<purpose>
  RFC-0514 contact.form.validate. Ensures sites using the send-message section
  declare emailField with enabled: true consistently across all published
  locales. Email is the minimum required structured field; phoneField is
  optional and may vary per locale. The check scans page content files for
  send-message blocks and validates cross-locale consistency.
  No-op pass when the site has no send-message blocks.
</purpose>
<non-goals>
  <item>Do not validate the section manifest schema — that is section.contract.validate.</item>
  <item>Do not validate form submission behavior — that is the client/API responsibility.</item>
  <item>Do not read content via the Astro runtime — disk only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0514: initial implementation — validates emailField presence and cross-locale consistency for send-message blocks.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { readdir, readFile, stat } from "node:fs/promises";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import type { CheckResult, Diagnostic } from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/site-kernel-astro";
import { parseMarkdownFrontmatter } from "@warpgogol/site-kernel-content";
import { diagnosticsResult, passResult } from "./result-helpers.ts";

interface SendMessageBlock {
  lang: string;
  file: string;
  hasEmailField: boolean;
  emailFieldEnabled: boolean | undefined;
}

async function collectSendMessageBlocks(appDir: string): Promise<SendMessageBlock[]> {
  const pagesDir = join(appDir, "src", "content", "pages");
  const blocks: SendMessageBlock[] = [];

  let langs: import("node:fs").Dirent[];
  try {
    langs = await readdir(pagesDir, { withFileTypes: true });
  } catch {
    return blocks;
  }

  for (const langEntry of langs) {
    if (!langEntry.isDirectory()) continue;
    const lang = langEntry.name;
    const langDir = join(pagesDir, lang);
    await scanDirForSendMessage(langDir, lang, blocks);
  }

  return blocks;
}

async function scanDirForSendMessage(
  dir: string,
  lang: string,
  blocks: SendMessageBlock[],
): Promise<void> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await scanDirForSendMessage(fullPath, lang, blocks);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      const raw = await readFile(fullPath, "utf-8");
      const { data } = parseMarkdownFrontmatter(raw);
      const found = findSendMessageBlocks(data, lang, fullPath);
      blocks.push(...found);
    }
  }
}

function findSendMessageBlocks(
  data: Record<string, unknown>,
  lang: string,
  file: string,
): SendMessageBlock[] {
  const blocks: SendMessageBlock[] = [];
  const sections = (data as Record<string, unknown>).sections;
  if (!Array.isArray(sections)) return blocks;

  for (const section of sections) {
    if (!isObject(section)) continue;
    const sectionId = section.id ?? section.sectionId;
    if (sectionId !== "send-message" && sectionId !== "send-message-section") continue;

    const props = section.props ?? section;
    const emailField = isObject(props) ? props.emailField : undefined;
    const hasEmailField = emailField !== undefined;
    const emailFieldEnabled = isObject(emailField)
      ? (emailField.enabled as boolean | undefined)
      : undefined;

    blocks.push({ lang, file, hasEmailField, emailFieldEnabled });
  }

  return blocks;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function runContactFormValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const command = "contact.form.validate";
  const paths = requireAstroSitePaths(context);

  const blocks = await collectSendMessageBlocks(paths.appDirectory);
  if (blocks.length === 0) {
    return passResult(command, `${command}: no send-message blocks found — no-op pass`);
  }

  const diagnostics: Diagnostic[] = [];

  const langs = [...new Set(blocks.map((b) => b.lang))];
  const enabledLangs = new Set(
    blocks.filter((b) => b.hasEmailField && b.emailFieldEnabled === true).map((b) => b.lang),
  );
  const missingEmailField = blocks.filter((b) => !b.hasEmailField);
  const disabledEmailField = blocks.filter((b) => b.hasEmailField && b.emailFieldEnabled !== true);

  for (const block of missingEmailField) {
    diagnostics.push({
      ruleId: "CONTACT-FORM-01",
      severity: "error",
      message: `send-message block in ${block.file} (${block.lang}) is missing emailField — email is the minimum required structured field (RFC-0514).`,
    });
  }

  for (const block of disabledEmailField) {
    diagnostics.push({
      ruleId: "CONTACT-FORM-01",
      severity: "error",
      message: `send-message block in ${block.file} (${block.lang}) has emailField.enabled !== true — email must be enabled (RFC-0514).`,
    });
  }

  if (enabledLangs.size > 0 && enabledLangs.size < langs.length) {
    const missingLangs = langs.filter((l) => !enabledLangs.has(l));
    diagnostics.push({
      ruleId: "CONTACT-FORM-02",
      severity: "error",
      message: `emailField is enabled in some locales but missing/disabled in: ${missingLangs.join(", ")} — cross-locale inconsistency (RFC-0514).`,
    });
  }

  return diagnosticsResult(command, diagnostics);
}
