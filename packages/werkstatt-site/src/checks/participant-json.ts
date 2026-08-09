/*
<MODULE_CONTRACT>
<purpose>
RFC-0512 participant.json.validate. Validates the generated JSON endpoints
(dist/team/profiles.json, dist/team/[slug]/profile.json, dist/team/ki-agenten/[slug]/profile.json)
for shape correctness, private field exclusion, and JSON-LD type compliance on
profile/hub pages. No-op pass when the site has no public participants.
</purpose>
<non-goals>
  <item>Do not generate JSON endpoints — that lives in the build.prepare step.</item>
  <item>Do not validate the Participant record contract — participant.validate owns that.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0512: initial implementation — validates team JSON endpoints for private field leakage and shape.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { readFile, readdir } from "node:fs/promises";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { passResult, resultFromViolations } from "./result-helpers.ts";

const PRIVATE_FIELDS = new Set([
  "consentRecordId",
  "profileOwner",
  "retentionClass",
  "agentId",
  "toolsetVersion",
  "modelProvider",
  "dataAccess",
  "operationalOwnerId",
  "technicalMaintainerId",
]);

function scanPrivateFields(obj: unknown, path: string): string[] {
  const violations: string[] = [];
  if (typeof obj !== "object" || obj === null) return violations;
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => violations.push(...scanPrivateFields(item, `${path}[${i}]`)));
    return violations;
  }
  const record = obj as Record<string, unknown>;
  for (const [key, val] of Object.entries(record)) {
    const fieldPath = path ? `${path}.${key}` : key;
    if (PRIVATE_FIELDS.has(key)) {
      violations.push(fieldPath);
    }
    violations.push(...scanPrivateFields(val, fieldPath));
  }
  return violations;
}

function hasField(obj: unknown, field: string): boolean {
  if (typeof obj !== "object" || obj === null) return false;
  return field in (obj as Record<string, unknown>);
}

function getField(obj: unknown, field: string): unknown {
  if (typeof obj !== "object" || obj === null) return undefined;
  return (obj as Record<string, unknown>)[field];
}

export async function runParticipantJsonValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const distDir = join(paths.appDirectory, "dist");
  const teamDir = join(distDir, "team");

  let profilesJsonExists = false;
  try {
    await readFile(join(teamDir, "profiles.json"), "utf-8");
    profilesJsonExists = true;
  } catch {
    // No profiles.json — check if the site has any participants at all
    const peopleBaseDir = join(paths.appDirectory, "src", "content", "people");
    try {
      const langs = await readdir(peopleBaseDir);
      if (langs.length === 0) {
        return passResult(
          "participant.json.validate",
          "participant.json.validate: OK — no Participant records",
        );
      }
    } catch {
      return passResult(
        "participant.json.validate",
        "participant.json.validate: OK — no people directory",
      );
    }
  }

  const violations: string[] = [];

  if (profilesJsonExists) {
    const profilesRaw = await readFile(join(teamDir, "profiles.json"), "utf-8");
    let profilesData: Record<string, unknown>;
    try {
      profilesData = JSON.parse(profilesRaw) as Record<string, unknown>;
    } catch {
      violations.push("[invalid-json] dist/team/profiles.json is not valid JSON");
      return resultFromViolations("participant.json.validate", violations);
    }

    if (!hasField(profilesData, "participants")) {
      violations.push(
        "[missing-participants] dist/team/profiles.json missing 'participants' array",
      );
    } else {
      const participants = getField(profilesData, "participants");
      if (!Array.isArray(participants)) {
        violations.push(
          "[invalid-participants] dist/team/profiles.json 'participants' is not an array",
        );
      } else {
        for (let i = 0; i < participants.length; i++) {
          const entry = participants[i] as Record<string, unknown>;
          if (!hasField(entry, "slug")) {
            violations.push(`[missing-slug] profiles.json[${i}]: missing slug`);
          }
          if (!hasField(entry, "participantType")) {
            violations.push(
              `[missing-participantType] profiles.json[${i}]: missing participantType`,
            );
          }
          if (!hasField(entry, "publicName")) {
            violations.push(`[missing-publicName] profiles.json[${i}]: missing publicName`);
          }
          if (!hasField(entry, "profileUrl")) {
            violations.push(`[missing-profileUrl] profiles.json[${i}]: missing profileUrl`);
          }
          if (!hasField(entry, "profileJsonUrl")) {
            violations.push(`[missing-profileJsonUrl] profiles.json[${i}]: missing profileJsonUrl`);
          }
        }
      }
    }

    // Check for private field leakage in profiles.json
    const privateLeaks = scanPrivateFields(profilesData, "");
    for (const leak of privateLeaks) {
      violations.push(`[private-field-leak] profiles.json: ${leak}`);
    }
  }

  // Validate individual profile.json files
  const checkProfileJson = async (dir: string, slug: string, isAiAgent: boolean): Promise<void> => {
    const filePath = join(dir, slug, "profile.json");
    let raw: string;
    try {
      raw = await readFile(filePath, "utf-8");
    } catch {
      violations.push(
        `[missing-profile-json] ${isAiAgent ? "ki-agenten" : "team"}/${slug}/profile.json not found`,
      );
      return;
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      violations.push(
        `[invalid-json] ${isAiAgent ? "ki-agenten" : "team"}/${slug}/profile.json is not valid JSON`,
      );
      return;
    }

    if (!hasField(data, "slug")) {
      violations.push(`[missing-slug] ${slug}/profile.json: missing slug`);
    }
    if (!hasField(data, "participantType")) {
      violations.push(`[missing-participantType] ${slug}/profile.json: missing participantType`);
    }
    if (!hasField(data, "publicName")) {
      violations.push(`[missing-publicName] ${slug}/profile.json: missing publicName`);
    }

    // Check for private field leakage
    const privateLeaks = scanPrivateFields(data, "");
    for (const leak of privateLeaks) {
      violations.push(`[private-field-leak] ${slug}/profile.json: ${leak}`);
    }

    // Check for birthDate in human profiles (must be excluded per RFC-0512)
    if (!isAiAgent && hasField(data, "birthDate")) {
      violations.push(
        `[birthdate-leak] ${slug}/profile.json: birthDate must not appear in public JSON`,
      );
    }

    // Check for consent-gated fields without consent
    if (!isAiAgent) {
      const hasConsent = hasField(data, "hasConsent") && getField(data, "hasConsent") === true;
      if (!hasConsent) {
        if (hasField(data, "location")) {
          violations.push(
            `[consent-gate-violation] ${slug}/profile.json: location present without consent`,
          );
        }
        if (hasField(data, "sameAs")) {
          violations.push(
            `[consent-gate-violation] ${slug}/profile.json: sameAs present without consent`,
          );
        }
      }
    }
  };

  // Scan team/ directory for human profile.json files
  try {
    const teamEntries = await readdir(teamDir, { withFileTypes: true });
    for (const entry of teamEntries) {
      if (entry.isDirectory() && entry.name !== "ki-agenten") {
        await checkProfileJson(teamDir, entry.name, false);
      }
    }
  } catch {
    // team/ directory doesn't exist — no profiles to check
  }

  // Scan team/ki-agenten/ directory for AI-agent profile.json files
  const aiAgentDir = join(teamDir, "ki-agenten");
  try {
    const aiAgentEntries = await readdir(aiAgentDir, { withFileTypes: true });
    for (const entry of aiAgentEntries) {
      if (entry.isDirectory()) {
        await checkProfileJson(aiAgentDir, entry.name, true);
      }
    }
  } catch {
    // ki-agenten/ directory doesn't exist — no AI-agent profiles to check
  }

  if (violations.length === 0) {
    return passResult(
      "participant.json.validate",
      "participant.json.validate: OK — team JSON endpoints conform",
    );
  }
  return resultFromViolations("participant.json.validate", violations);
}
