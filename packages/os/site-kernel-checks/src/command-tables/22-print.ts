/*
<MODULE_CONTRACT>
<purpose>Data-driven command table for RFC-0257 print validation and generation commands.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0257: Initial creation — print command table.</item>
</CHANGE_SUMMARY>
*/

import type { CheckCommandEntry } from "./types.ts";
import { runPrintContractValidate, runPrintLayoutValidate } from "../print.ts";
import { runPrintPdfGenerate, runPrintPdfCopy, runPrintPdfValidate } from "../print-pdf.ts";

export const PRINT_COMMANDS: CheckCommandEntry[] = [
  /* RFC-0257: print contract validation */
  {
    name: "print.contract.validate",
    description:
      "Validate page print frontmatter and site print labels against the RFC-0257 content contract (PRINT-CONTRACT-01..07).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md", "<app>/src/content/**/*.md"],
    execute: runPrintContractValidate,
  },
  /* RFC-0257: print layout validation */
  {
    name: "print.layout.validate",
    description:
      "Static analysis of shared UI CSS for print-blocking patterns (PRINT-LAYOUT-01..06). Runs in build.check.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["packages/ui/src/**/*.css", "packages/ui/src/**/*.scss"],
    execute: runPrintLayoutValidate,
  },
  /* RFC-0257 / RFC-0653: PDF generation via Playwright — writes to .cache/pdf/ */
  {
    name: "print.pdf.generate",
    description:
      "Generate PDFs from the built static site using Playwright Chromium. Writes to .cache/pdf/<hash>/ (RFC-0653). Use print.pdf.copy to copy PDFs into dist/client/_print/. Exits early when output.printPdf is not true (RFC-0257).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    mutatesState: true,
    reads: [
      "<app>/src/content/system.md",
      "<app>/src/content/**/*.md",
      "<app>/dist/client/**/*.html",
    ],
    writes: ["<app>/.cache/pdf/**"],
    execute: runPrintPdfGenerate,
  },
  /* RFC-0653: copy PDFs from .cache/pdf/ to dist/client/_print/ */
  {
    name: "print.pdf.copy",
    description:
      "Copy generated PDFs from .cache/pdf/ to dist/client/_print/. Runs in build.post after print.pdf.generate. Not cacheable — always executes to restore PDFs into freshly-built dist/.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    cacheable: false,
    reads: ["<app>/.cache/pdf/**/*.pdf"],
    writes: ["<app>/dist/client/_print/**"],
    execute: runPrintPdfCopy,
  },
  /* RFC-0257: PDF validation */
  {
    name: "print.pdf.validate",
    description:
      "Verify that every expected PDF file exists and is non-empty in dist/client/_print/ (PRINT-PDF-01..02). Runs in build.post after generation.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/dist/client/_print/**/*.pdf", "<app>/src/content/system.md"],
    execute: runPrintPdfValidate,
  },
];
