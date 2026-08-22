/*
<MODULE_CONTRACT>
<purpose>
RFC-0909: Search engine verification validator. Validates the verification
declaration in system.md (offline mode) and optionally checks live DNS TXT
records or rendered HTML meta tags (--live mode).
</purpose>
<non-goals>
  <item>Do not submit sitemaps — that lives in search-sitemap-submit.ts.</item>
  <item>Do not manage DNS records — that lives in the dns.record.upsert command (RFC-0753).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0909: initial search engine verification validator with offline + live modes.</item>
</CHANGE_SUMMARY>
*/

import { resolveTxt } from "node:dns/promises";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { diagnosticsResult, passResult } from "../result-helpers.ts";
import { asRecord, asString, loadPublicContext, workspaceRel } from "./shared.ts";

const GOOGLE_TOKEN_PREFIX = "google-site-verification=";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;

export function normalizeTxtValue(value: string): string {
  return value
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();
}

export function isGoogleTokenValid(token: string): boolean {
  if (!token.startsWith(GOOGLE_TOKEN_PREFIX)) return false;
  return TOKEN_PATTERN.test(token.slice(GOOGLE_TOKEN_PREFIX.length));
}

function buildDiagnostic(
  ruleId: string,
  severity: "error" | "warning" | "info",
  message: string,
  file?: string,
): Diagnostic {
  const diag: Diagnostic = { ruleId, severity, message };
  if (file) diag.file = file;
  return diag;
}

export async function runSearchVerificationValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const command = "search.verification.validate";
  const live = input.flags?.live === true;
  const app = await loadPublicContext(context);
  const manifestPath = workspaceRel(
    context,
    `${app.contentDirectory}/system.md`.replace(/\\/g, "/"),
  );

  const verification = asRecord(app.manifest.verification);
  const google = verification ? asRecord(verification.google) : undefined;

  if (!google) {
    return diagnosticsResult(command, [
      buildDiagnostic(
        "SEARCH-VERIFY-01",
        "error",
        `No verification.google block found in system.md. Add a verification section with method and token to enable search engine verification.`,
        manifestPath,
      ),
    ]);
  }

  const method = asString(google.method);
  const token = asString(google.token);

  const diagnostics: Diagnostic[] = [];

  if (!method || (method !== "dns-txt" && method !== "meta-tag")) {
    diagnostics.push(
      buildDiagnostic(
        "SEARCH-VERIFY-01",
        "error",
        `verification.google.method must be "dns-txt" or "meta-tag", got: ${method ?? "(missing)"}`,
        manifestPath,
      ),
    );
  }

  if (!token) {
    diagnostics.push(
      buildDiagnostic(
        "SEARCH-VERIFY-01",
        "error",
        `verification.google.token is missing or empty in system.md.`,
        manifestPath,
      ),
    );
  }

  if (token && !token.startsWith(GOOGLE_TOKEN_PREFIX)) {
    diagnostics.push(
      buildDiagnostic(
        "SEARCH-VERIFY-04",
        "warning",
        `verification.google.token should start with "${GOOGLE_TOKEN_PREFIX}" for Google Search Console verification.`,
        manifestPath,
      ),
    );
  }

  if (token && !TOKEN_PATTERN.test(token.slice(GOOGLE_TOKEN_PREFIX.length))) {
    diagnostics.push(
      buildDiagnostic(
        "SEARCH-VERIFY-04",
        "warning",
        `verification.google.token contains invalid characters after the prefix. Only [A-Za-z0-9_-] are allowed.`,
        manifestPath,
      ),
    );
  }

  if (diagnostics.length > 0) {
    return diagnosticsResult(command, diagnostics);
  }

  if (!live || !method || !token) {
    return passResult(command, `[${command}] verification config is valid (offline check)`);
  }

  if (!app.domain) {
    diagnostics.push(
      buildDiagnostic(
        "SEARCH-VERIFY-NETWORK",
        "info",
        `Cannot perform live verification: site domain is not resolved from system.md.`,
        manifestPath,
      ),
    );
    return diagnosticsResult(command, diagnostics);
  }

  if (method === "dns-txt") {
    try {
      const records = await resolveTxt(app.domain);
      const flatRecords = records.flat().map(normalizeTxtValue);
      const declaredToken = normalizeTxtValue(token);
      const found = flatRecords.some((record) => record === declaredToken);

      if (!found) {
        diagnostics.push(
          buildDiagnostic(
            "SEARCH-VERIFY-02",
            "error",
            `DNS TXT record for ${app.domain} does not contain the declared verification token. Expected: "${declaredToken}". Found records: ${flatRecords.length > 0 ? flatRecords.map((r) => `"${r}"`).join(", ") : "(none)"}`,
          ),
        );
      }
    } catch (error) {
      diagnostics.push(
        buildDiagnostic(
          "SEARCH-VERIFY-NETWORK",
          "info",
          `DNS lookup failed for ${app.domain}: ${error instanceof Error ? error.message : String(error)}. This may be a transient network issue — re-run after confirming DNS propagation.`,
        ),
      );
    }
  } else if (method === "meta-tag") {
    try {
      const siteUrl = app.siteUrl ?? `https://${app.domain}`;
      const response = await fetch(siteUrl, { redirect: "follow" });
      if (!response.ok) {
        diagnostics.push(
          buildDiagnostic(
            "SEARCH-VERIFY-NETWORK",
            "info",
            `HTTP ${response.status} ${response.statusText} fetching ${siteUrl}. Cannot verify meta tag — re-run after the site is deployed.`,
          ),
        );
      } else {
        const html = await response.text();
        const metaPattern =
          /<meta\s+name=["']google-site-verification["']\s+content=["']([^"']+)["']/i;
        const match = html.match(metaPattern);
        const foundToken = match?.[1];

        if (!foundToken) {
          diagnostics.push(
            buildDiagnostic(
              "SEARCH-VERIFY-03",
              "error",
              `No <meta name="google-site-verification"> tag found in the homepage HTML at ${siteUrl}.`,
            ),
          );
        } else if (foundToken !== token) {
          diagnostics.push(
            buildDiagnostic(
              "SEARCH-VERIFY-03",
              "error",
              `Meta tag content mismatch. Declared: "${token}", found: "${foundToken}".`,
            ),
          );
        }
      }
    } catch (error) {
      diagnostics.push(
        buildDiagnostic(
          "SEARCH-VERIFY-NETWORK",
          "info",
          `Failed to fetch ${app.siteUrl ?? `https://${app.domain}`}: ${error instanceof Error ? error.message : String(error)}. This may be a transient network issue.`,
        ),
      );
    }
  }

  if (diagnostics.length === 0) {
    return passResult(command, `[${command}] verification config is valid (live check passed)`);
  }

  return diagnosticsResult(command, diagnostics);
}
