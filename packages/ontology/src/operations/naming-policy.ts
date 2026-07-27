/*
<MODULE_CONTRACT>
<purpose>RFC-0361: Centralized naming policy regexes and policy descriptors for Sternsystem, Mission, Release, and Bordbuch ids.</purpose>
<non-goals>
  <item>Does not define filename policies — that is DNA-6 / RFC-0360.</item>
  <item>Does not define content-level naming — that is RFC-0047.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0361: initial centralized naming policy regexes and descriptors.</item>
</CHANGE_SUMMARY>
*/

export const STERNSYSTEM_ID_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const MISSION_ID_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*-m\d{6}$/;
export const RELEASE_ID_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*-r\d{6}$/;
export const BORDBUCH_EVENT_ID_REGEX = /^event-\d{6}$/;

export const NON_ASCII_REGEX = /[^\x00-\x7F]/;

export const STERNSYSTEM_ID_POLICY = {
  regex: STERNSYSTEM_ID_REGEX,
  charset: "ASCII lowercase letters (a-z), digits (0-9), hyphens (-)",
  description: "kebab-case, lowercase, latin-only",
  examples: ["warpgogol-com", "nicaragua-projekt"],
  counterExamples: ["Warpgogol-Com", "nicaragüa-projekt", "warpgogol--com", "-warpgogol", "warpgogol-"],
} as const;

export const MISSION_ID_POLICY = {
  regex: MISSION_ID_REGEX,
  format: "<system-id>-m<NNNNNN>",
  description: "system id + literal -m + zero-padded six-digit sequence",
  examples: ["warpgogol-com-m000001", "nicaragua-projekt-m000042"],
  counterExamples: ["warpgogol-com-m1", "warpgogol-com-M000001", "warpgogol-com-m0000001"],
} as const;

export const RELEASE_ID_POLICY = {
  regex: RELEASE_ID_REGEX,
  format: "<system-id>-r<NNNNNN>",
  description: "system id + literal -r + zero-padded six-digit sequence",
  examples: ["warpgogol-com-r000001", "nicaragua-projekt-r000042"],
  counterExamples: ["warpgogol-com-r1", "warpgogol-com-R000001", "warpgogol-com-r0000001"],
} as const;

export const BORDBUCH_EVENT_ID_POLICY = {
  regex: BORDBUCH_EVENT_ID_REGEX,
  format: "event-<NNNNNN>",
  description: "literal 'event-' + zero-padded six-digit sequence",
  examples: ["event-000001", "event-000042"],
  counterExamples: ["event-1", "event-0000001", "EVENT-000001"],
} as const;

export function isLatinOnly(value: string): boolean {
  return !NON_ASCII_REGEX.test(value);
}
