/*
<MODULE_CONTRACT>
<purpose>Release schema for the system manifest: versioning and release channel configuration.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303 Phase 3: extracted from schemas/system.ts as part of the domain split.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";

/**
 * The `release.passport` sub-tree in system.yaml.
 * Controls Cosmic Passport rendering and signing key management.
 *
 * Client-writable: enabled, indexable
 * Engineering-only: keyVersion, heartbeatUrl
 *
 * Enforced by client.edit.validate: partial-YAML rules.
 */
export const systemPassportSchema = z.object({
  /**
   * When true, /cosmic/passport page is rendered at build time.
   * The passport JSON is always emitted regardless of this toggle.
   * CLIENT-WRITABLE.
   */
  enabled: z.boolean().optional().default(true),

  /**
   * When true (default), /cosmic/passport is indexable by search engines.
   * Set to false for stealth/pre-launch deployments.
   * CLIENT-WRITABLE.
   */
  indexable: z.boolean().optional().default(true),

  /**
   * Active signing key version (e.g. "v1", "v2").
   * Updated by passport.key.rotate. ENGINEERING-ONLY.
   */
  keyVersion: z.string().min(1).optional().default("v1"),

  /**
   * Optional Healthchecks.io-style URL to ping on every build.
   * pulsar.heartbeat fires a GET to this URL; never fails the build.
   * ENGINEERING-ONLY.
   */
  heartbeatUrl: z.url().optional(),
});

export const systemReleaseSchema = z.object({
  passport: systemPassportSchema.optional(),
});

export type SystemPassport = z.infer<typeof systemPassportSchema>;
export type SystemRelease = z.infer<typeof systemReleaseSchema>;
