/*
<MODULE_CONTRACT>
<purpose>
RFC-0211: barrel for the Content Knowledge Lifecycle (CKL) shared model. Re-exports
the framework-free claim contracts consumed by the kernel CKL commands and validators
(RFC-0212..0218). Later CKL RFCs add sibling modules here (freshness, source,
derivation, plan, ledger) and re-export them from this barrel.
</purpose>
<non-goals>
  <item>Do not add logic here — pure re-export barrel.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0211: initial barrel exporting the claim model.</item>
</CHANGE_SUMMARY>
*/

export * from "./claim.ts";
export * from "./freshness.ts";
export * from "./derivation.ts";
export * from "./source.ts";
export * from "./plan.ts";
export * from "./ledger.ts";
