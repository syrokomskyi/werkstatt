/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-handoff/src/bordbuch/bordbuch-io.ts as an authored site-kernel-handoff authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Does not define mission lifecycle — that lives in the mission module.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0355: initial Bordbuch hash-chain helpers.</item>
  <item>RFC-0473: add runtime writer-role for pseo and indexnow.submit kinds.</item>
  <item>RFC-0477: add commitAndPushBordbuch helper for git commit+push after bordbuch append.</item>
  <item>RFC-0574: resolveBordbuchPath uses resolveCachePath (mirrors[0].path) instead of hardcoded systems/<id>/.</item>
  <item>RFC-0580: extract gitExec into shared werkstatt/git-exec.ts with allowNonZero option.</item>
  <item>RFC-0583: export computeEntryHash for reuse by bordbuch.repair.</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  bordbuchEntrySchema,
  type BordbuchEntry,
  type BordbuchEntryKind,
} from "@warpgogol/ontology/operations";
import { atomicWriteFile } from "../werkstatt/atomic.ts";
import { resolveCachePath } from "../sternsystem/registry-io.ts";
import { gitExec } from "../werkstatt/git-exec.ts";

const BORDBUCH_PATH = path.join("bordbuch", "events.ndjson");

export async function resolveBordbuchPath(
  workspaceRoot: string,
  systemId: string,
): Promise<string> {
  const cachePath = await resolveCachePath(workspaceRoot, systemId);
  return path.join(cachePath, BORDBUCH_PATH);
}

const WRITER_ROLE_KINDS: Record<string, BordbuchEntryKind[]> = {
  mission: ["mission-open", "mission-close", "mission-abort", "preflight-skipped"],
  release: ["release-published", "release-rolled-back"],
  sternsystem: ["pin-update"],
  leitstand: ["deployment"],
  notausgang: ["notausgang-export"],
  operator: ["operator-note", "erratum"],
  runtime: ["pseo", "indexnow.submit"],
};

export function validateWriterRole(writerRole: string, kind: BordbuchEntryKind): boolean {
  const allowed = WRITER_ROLE_KINDS[writerRole];
  return allowed ? allowed.includes(kind) : false;
}

const SENSITIVE_PATTERNS: RegExp[] = [
  /password/i,
  /secret/i,
  /token/i,
  /credential/i,
  /api[_-]?key/i,
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
  /\+?\d{1,4}[\s-]?\(?\d{1,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}/,
];

export function containsSensitivePayload(text: string): boolean {
  return SENSITIVE_PATTERNS.some((p) => p.test(text));
}

export function computeEntryHash(entry: Omit<BordbuchEntry, "hash">): string {
  const stable = JSON.stringify(entry, Object.keys(entry).sort());
  return `sha256:${createHash("sha256").update(stable).digest("hex")}`;
}

function nextEventId(entries: BordbuchEntry[]): string {
  const maxNum = entries.reduce((max, e) => {
    const m = e.id.match(/^event-(\d{6})$/);
    return m ? Math.max(max, parseInt(m[1], 10)) : max;
  }, 0);
  return `event-${String(maxNum + 1).padStart(6, "0")}`;
}

export async function readBordbuch(
  workspaceRoot: string,
  systemId: string,
): Promise<BordbuchEntry[]> {
  const filePath = await resolveBordbuchPath(workspaceRoot, systemId);
  if (!existsSync(filePath)) return [];
  const raw = await fs.readFile(filePath, "utf8");
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  const entries: BordbuchEntry[] = [];
  for (const line of lines) {
    const parsed = bordbuchEntrySchema.parse(JSON.parse(line));
    entries.push(parsed);
  }
  return entries;
}

export async function appendBordbuchEntry(
  workspaceRoot: string,
  systemId: string,
  kind: BordbuchEntryKind,
  summary: string,
  actor: string,
  options?: {
    missionId?: string | null;
    releaseId?: string | null;
    writerRole?: string;
    metadata?: Record<string, unknown>;
    status?: BordbuchEntry["status"];
    erratumOf?: string;
  },
): Promise<BordbuchEntry> {
  const filePath = await resolveBordbuchPath(workspaceRoot, systemId);
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) {
    await fs.mkdir(dir, { recursive: true });
  }

  if (containsSensitivePayload(summary)) {
    throw new Error(
      "[bordbuch.append] sensitive payload detected in summary — redact before appending",
    );
  }

  const entries = await readBordbuch(workspaceRoot, systemId);
  const previousHash = entries.length > 0 ? entries[entries.length - 1].hash : null;
  const id = nextEventId(entries);

  const entryWithoutHash: Omit<BordbuchEntry, "hash"> = {
    schemaVersion: "1.0.0",
    id,
    systemId,
    occurredAt: new Date().toISOString(),
    kind,
    status: options?.status ?? "done",
    missionId: options?.missionId ?? null,
    releaseId: options?.releaseId ?? null,
    actor,
    summary,
    metadata: options?.metadata,
    previousHash,
    erratumOf: options?.erratumOf,
  };

  const hash = computeEntryHash(entryWithoutHash);
  const entry: BordbuchEntry = { ...entryWithoutHash, hash };

  bordbuchEntrySchema.parse(entry);

  const line = JSON.stringify(entry) + "\n";
  const existingContent = existsSync(filePath) ? await fs.readFile(filePath, "utf8") : "";
  const separator = existingContent.length > 0 && !existingContent.endsWith("\n") ? "\n" : "";
  await atomicWriteFile(filePath, `${existingContent}${separator}${line}`);
  return entry;
}

export interface BordbuchViolation {
  rule: string;
  message: string;
  eventId?: string;
}

export async function validateBordbuch(
  workspaceRoot: string,
  systemId: string,
): Promise<{ entries: number; violations: BordbuchViolation[] }> {
  const entries = await readBordbuch(workspaceRoot, systemId);
  const violations: BordbuchViolation[] = [];

  let prevHash: string | null = null;
  let expectedId = 1;
  const openMissions = new Set<string>();
  const allMissionIds = new Set<string>();

  for (const entry of entries) {
    // Event id sequence
    const expectedIdStr = `event-${String(expectedId).padStart(6, "0")}`;
    if (entry.id !== expectedIdStr) {
      violations.push({
        rule: "event-id-gap",
        message: `expected id '${expectedIdStr}', got '${entry.id}'`,
        eventId: entry.id,
      });
    }
    expectedId++;

    // previousHash chain
    if (entry.previousHash !== prevHash) {
      violations.push({
        rule: "hash-chain-gap",
        message: `expected previousHash '${prevHash}', got '${entry.previousHash}'`,
        eventId: entry.id,
      });
    }

    // hash verification
    const { hash: _hash, ...entryWithoutHash } = entry;
    const computedHash = computeEntryHash(entryWithoutHash);
    if (entry.hash !== computedHash) {
      violations.push({
        rule: "hash-mismatch",
        message: `hash mismatch for '${entry.id}'`,
        eventId: entry.id,
      });
    }

    prevHash = entry.hash;

    // Mission lifecycle pairing
    if (entry.kind === "mission-open") {
      if (entry.missionId && allMissionIds.has(entry.missionId)) {
        violations.push({
          rule: "duplicate-mission-id",
          message: `duplicate mission-open for '${entry.missionId}'`,
          eventId: entry.id,
        });
      }
      if (entry.missionId) {
        openMissions.add(entry.missionId);
        allMissionIds.add(entry.missionId);
      }
    } else if (entry.kind === "mission-close" || entry.kind === "mission-abort") {
      if (entry.missionId && !openMissions.has(entry.missionId)) {
        violations.push({
          rule: "orphan-mission-close",
          message: `${entry.kind} for '${entry.missionId}' has no preceding mission-open`,
          eventId: entry.id,
        });
      }
      if (entry.missionId) {
        openMissions.delete(entry.missionId);
      }
    }

    // Sensitive payload guard
    if (containsSensitivePayload(entry.summary)) {
      violations.push({
        rule: "sensitive-payload",
        message: `sensitive payload detected in '${entry.id}'`,
        eventId: entry.id,
      });
    }
  }

  // Unmatched open missions — skip the currently active mission (registry.currentMission)
  let currentMission: string | null = null;
  try {
    const { readRegistry, findEntry } = await import("../sternsystem/registry-io.ts");
    const registry = await readRegistry(workspaceRoot);
    const entry = findEntry(registry, systemId);
    currentMission = entry?.currentMission ?? null;
  } catch {
    // Registry not available — check all missions
  }
  for (const openId of openMissions) {
    if (openId === currentMission) continue;
    violations.push({
      rule: "unmatched-mission-open",
      message: `mission '${openId}' has mission-open but no mission-close or mission-abort`,
    });
  }

  return { entries: entries.length, violations };
}

export function deriveNextMissionNumber(entries: BordbuchEntry[]): number {
  let maxNum = 0;
  for (const entry of entries) {
    if (entry.kind === "mission-open" && entry.missionId) {
      const m = entry.missionId.match(/-m(\d{6})$/);
      if (m) {
        maxNum = Math.max(maxNum, parseInt(m[1], 10));
      }
    }
  }
  return maxNum + 1;
}

/**
 * Derive the next mission number, considering both Bordbuch entries AND
 * existing mission directories on disk. This prevents reusing a mission ID
 * from an aborted mission that was never recorded in the Bordbuch.
 */
export async function deriveNextMissionNumberSafe(
  entries: BordbuchEntry[],
  workspaceRoot: string,
  systemId: string,
): Promise<number> {
  let maxNum = 0;
  for (const entry of entries) {
    if (entry.kind === "mission-open" && entry.missionId) {
      const m = entry.missionId.match(/-m(\d{6})$/);
      if (m) {
        maxNum = Math.max(maxNum, parseInt(m[1], 10));
      }
    }
  }
  // Also scan existing mission directories on disk
  const missionsPath = path.join(workspaceRoot, "missions");
  if (existsSync(missionsPath)) {
    const dirs = await fs.readdir(missionsPath, { withFileTypes: true });
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      if (!d.name.startsWith(`${systemId}-m`)) continue;
      const m = d.name.match(/-m(\d{6})$/);
      if (m) {
        maxNum = Math.max(maxNum, parseInt(m[1], 10));
      }
    }
  }
  return maxNum + 1;
}

export interface CommitAndPushResult {
  commitSha: string | null;
  pushed: boolean;
  error: string | null;
}

export async function commitAndPushBordbuch(
  systemDir: string,
  message: string,
): Promise<CommitAndPushResult> {
  const bordbuchPath = path.join("bordbuch", "events.ndjson");
  const statusPath = path.join("bordbuch", "status.generated.yaml");

  try {
    gitExec(systemDir, `add ${bordbuchPath}`);
    // Also commit bordbuch/status.generated.yaml if it exists (RFC-0597 fix: prevent dirty cache clone)
    if (existsSync(path.join(systemDir, statusPath))) {
      try {
        gitExec(systemDir, `add ${statusPath}`);
      } catch {
        // status.generated.yaml may not exist or may be gitignored — non-fatal
      }
    }
  } catch {
    return { commitSha: null, pushed: false, error: null };
  }

  let commitSha: string | null = null;
  try {
    gitExec(systemDir, `commit -m ${JSON.stringify(message)}`);
    commitSha = gitExec(systemDir, "rev-parse HEAD");
  } catch {
    return { commitSha: null, pushed: false, error: null };
  }

  let branch: string;
  try {
    branch = gitExec(systemDir, "rev-parse --abbrev-ref HEAD");
  } catch {
    return { commitSha, pushed: false, error: "could not detect current branch" };
  }

  try {
    gitExec(systemDir, `push origin ${branch}`);
    return { commitSha, pushed: true, error: null };
  } catch (err) {
    const stderr = (err as Error).message;
    return { commitSha, pushed: false, error: stderr };
  }
}
