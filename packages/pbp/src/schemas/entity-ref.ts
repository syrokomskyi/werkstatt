/*
<MODULE_CONTRACT>
<purpose>Zod schema for PBP EntityRef (RFC-0399, RFC-0466).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0466 — Zod schema for PbpEntityRef.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { nonEmptyString } from "./primitives.js";

export const pbpEntityRefSchema = z.object({
  ref: nonEmptyString,
  expectedType: nonEmptyString.optional(),
});
