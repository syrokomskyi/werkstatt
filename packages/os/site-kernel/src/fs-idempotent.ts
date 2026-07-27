/*
<MODULE_CONTRACT>
<purpose>
  RFC-0345: idempotent file-write primitive. Reads the existing file and
  compares content byte-for-byte before delegating to writeFileAtomic.
  Eliminates unnecessary disk writes when generated file content has not
  changed, preventing git noise and build churn from volatile timestamps.
</purpose>
<non-goals>
  <item>Do not perform semantic comparison (JSON key ordering, whitespace normalization) — exact string match only.</item>
  <item>Do not handle file locking — convergent atomic writes are sufficient per RFC-0087.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0345: initial idempotent write primitive.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { writeFileAtomic } from "./fs-atomic.ts";

/**
 * Write `content` to `filePath` only if the existing file content differs.
 * Delegates the actual write to `writeFileAtomic` (RFC-0258 parallel-safe).
 * Returns "written" if the file was created or updated, "unchanged" if
 * the existing content is byte-identical.
 */
export async function writeFileIfChanged(
  filePath: string,
  content: string,
): Promise<"written" | "unchanged"> {
  try {
    const existing = await readFile(filePath, "utf8");
    if (existing === content) {
      return "unchanged";
    }
  } catch {
    // File does not exist — proceed to write.
  }
  await writeFileAtomic(filePath, content);
  return "written";
}
