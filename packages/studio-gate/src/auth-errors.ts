/*
<MODULE_CONTRACT>
<purpose>
  Auth error mapping and formatting for Studio Gate MCP responses.
  Extracted from index.ts so error code mapping is independently testable.
</purpose>
<non-goals>
  <item>Does not perform auth verification — that lives in auth.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Architecture review 2026-07-14: extract auth error formatting from index.ts.</item>
</CHANGE_SUMMARY>
*/

import type { StudioGateAuthResult } from "./auth.ts";

export const AUTH_ERROR_CODES: Record<string, { code: number; message: string }> = {
  "authentication-required": { code: -32001, message: "authentication-required" },
  "site-mismatch": { code: -32002, message: "site-mismatch" },
  "insufficient-scope": { code: -32003, message: "insufficient-scope" },
  "credential-revoked": { code: -32004, message: "credential-revoked" },
  "auth-config-missing": { code: -32005, message: "auth-config-missing" },
  "auth-config-malformed": { code: -32006, message: "auth-config-malformed" },
  "system-id-required": { code: -32007, message: "system-id-required" },
  "credential-not-found": { code: -32001, message: "authentication-required" },
  "credential-expired": { code: -32001, message: "authentication-required" },
  "signature-invalid": { code: -32001, message: "authentication-required" },
};

const HINTS: Record<number, string> = {
  [-32001]:
    "Provide a valid VC credential in _meta.identity or X-Werkstatt-Credential header",
  [-32005]:
    "werkstatt.identity.json not found. Run identity.bootstrap (RFC-0558) to create it.",
  [-32006]:
    "werkstatt.identity.json is not valid JSON or is missing required fields.",
  [-32007]: "_meta.system is required in enforced mode for site-scoping",
};

export function formatAuthError(result: StudioGateAuthResult): {
  content: { type: "text"; text: string }[];
  isError: boolean;
} {
  const errorKey = result.error ?? "authentication-required";
  const mapped = AUTH_ERROR_CODES[errorKey] ?? AUTH_ERROR_CODES["authentication-required"]!;

  const data: Record<string, unknown> = {};
  if (result.expected) data["expected"] = result.expected;
  if (result.presented) data["presented"] = result.presented;
  if (result.required) data["required"] = result.required;
  const hint = HINTS[mapped.code];
  if (hint) data["hint"] = hint;

  const errorObject = {
    code: mapped.code,
    message: mapped.message,
    data,
  };

  return {
    content: [{ type: "text", text: JSON.stringify(errorObject) }],
    isError: true,
  };
}
