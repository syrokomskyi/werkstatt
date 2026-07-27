import { describe, it, expect } from "vitest";
import {
  isPbpChargeType,
  isPbpAmountModel,
  isPbpAdjustmentType,
  PBP_CHARGE_TYPES,
  PBP_AMOUNT_MODELS,
  PBP_ADJUSTMENT_TYPES,
  isPbpPolicyKind,
  PBP_POLICY_KINDS,
  isPbpGuaranteeOperator,
  isPbpGuaranteeRemedyType,
  PBP_GUARANTEE_OPERATORS,
  PBP_GUARANTEE_REMEDY_TYPES,
  isPbpSlaOperator,
  isPbpSlaRemedyType,
  PBP_SLA_OPERATORS,
  PBP_SLA_REMEDY_TYPES,
  isPbpTaxTreatment,
  PBP_TAX_TREATMENTS,
  isPbpFulfillmentMode,
  PBP_FULFILLMENT_MODES,
  isPbpRenewalMode,
  PBP_RENEWAL_MODES,
  isPbpAvailabilityMode,
  PBP_AVAILABILITY_MODES,
  isPbpOfferingRelation,
  PBP_OFFERING_RELATIONS,
  isPbpComparisonValueType,
  PBP_COMPARISON_VALUE_TYPES,
  isPbpComparisonStatus,
  PBP_COMPARISON_STATUSES,
  isPbpOverlayStaleBehavior,
  PBP_OVERLAY_STALE_BEHAVIORS,
  isPbpValidationSeverity,
  PBP_VALIDATION_SEVERITIES,
  isPbpErrorPrefix,
  PBP_ERROR_PREFIXES,
  isPbpSignatureAlgorithm,
  PBP_SIGNATURE_ALGORITHMS,
  isPbpMachineUsePermission,
  PBP_MACHINE_USE_PERMISSIONS,
  isPbpMachineUseVerdict,
  PBP_MACHINE_USE_VERDICTS,
  isPbpAssetHolder,
  PBP_ASSET_HOLDERS,
  isPbpDisclosureKind,
  isPbpDisclosureMateriality,
  isPbpCredentialKind,
  isPbpReviewContentMode,
  isPbpDocumentKind,
  isPbpEvidenceKind,
  isPbpContactChannel,
  isPbpWebPresenceKind,
  isPbpWebControlStatus,
  isPbpPlaceKind,
  isPbpDependencyInvalidationRule,
  isPbpNormalizationDecision,
  isPbpRegistryKind,
  isPbpCompilerPhase,
  isPbpBuildStrictness,
  isPbpDerivationStatus,
  isPbpDerivationMode,
  isPbpCanonicalSerializationStep,
} from "../src/index.js";
import { PBP_CANONICAL_SERIALIZATION_STEPS } from "../src/publication.js";

describe("RFC-0437: Pricing type guards", () => {
  it("PbpChargeType has 4 values", () => {
    expect(PBP_CHARGE_TYPES).toHaveLength(4);
  });

  it("isPbpChargeType validates", () => {
    expect(isPbpChargeType("one-time")).toBe(true);
    expect(isPbpChargeType("recurring")).toBe(true);
    expect(isPbpChargeType("unknown")).toBe(false);
  });

  it("PbpAmountModel has 4 values", () => {
    expect(PBP_AMOUNT_MODELS).toHaveLength(4);
  });

  it("isPbpAmountModel validates", () => {
    expect(isPbpAmountModel("fixed")).toBe(true);
    expect(isPbpAmountModel("tiered")).toBe(true);
    expect(isPbpAmountModel("unknown")).toBe(false);
  });

  it("PbpAdjustmentType has 3 values", () => {
    expect(PBP_ADJUSTMENT_TYPES).toHaveLength(3);
  });

  it("isPbpAdjustmentType validates", () => {
    expect(isPbpAdjustmentType("discount")).toBe(true);
    expect(isPbpAdjustmentType("surcharge")).toBe(true);
    expect(isPbpAdjustmentType("waiver")).toBe(true);
    expect(isPbpAdjustmentType("unknown")).toBe(false);
  });
});

describe("RFC-0439: Policy type guards", () => {
  it("PbpPolicyKind has 7 values", () => {
    expect(PBP_POLICY_KINDS).toHaveLength(7);
  });

  it("isPbpPolicyKind validates", () => {
    expect(isPbpPolicyKind("service-level")).toBe(true);
    expect(isPbpPolicyKind("guarantee")).toBe(true);
    expect(isPbpPolicyKind("cancellation")).toBe(true);
    expect(isPbpPolicyKind("unknown")).toBe(false);
  });
});

describe("RFC-0447: SLA type guards", () => {
  it("PbpSlaOperator has 3 values", () => {
    expect(PBP_SLA_OPERATORS).toHaveLength(3);
  });

  it("isPbpSlaOperator validates", () => {
    expect(isPbpSlaOperator("less-than-or-equal")).toBe(true);
    expect(isPbpSlaOperator("equals")).toBe(true);
    expect(isPbpSlaOperator("unknown")).toBe(false);
  });

  it("PbpSlaRemedyType has 2 values", () => {
    expect(PBP_SLA_REMEDY_TYPES).toHaveLength(2);
  });

  it("isPbpSlaRemedyType validates", () => {
    expect(isPbpSlaRemedyType("service-credit")).toBe(true);
    expect(isPbpSlaRemedyType("continued-performance")).toBe(true);
    expect(isPbpSlaRemedyType("refund")).toBe(false);
  });
});

describe("RFC-0448: Guarantee type guards", () => {
  it("PbpGuaranteeOperator has 3 values", () => {
    expect(PBP_GUARANTEE_OPERATORS).toHaveLength(3);
  });

  it("isPbpGuaranteeOperator validates", () => {
    expect(isPbpGuaranteeOperator("less-than-or-equal")).toBe(true);
    expect(isPbpGuaranteeOperator("greater-than-or-equal")).toBe(true);
    expect(isPbpGuaranteeOperator("equals")).toBe(true);
    expect(isPbpGuaranteeOperator("unknown")).toBe(false);
  });

  it("PbpGuaranteeRemedyType has 3 values", () => {
    expect(PBP_GUARANTEE_REMEDY_TYPES).toHaveLength(3);
  });

  it("isPbpGuaranteeRemedyType validates", () => {
    expect(isPbpGuaranteeRemedyType("continued-performance")).toBe(true);
    expect(isPbpGuaranteeRemedyType("service-credit")).toBe(true);
    expect(isPbpGuaranteeRemedyType("refund")).toBe(true);
    expect(isPbpGuaranteeRemedyType("unknown")).toBe(false);
  });
});

describe("RFC-0446: Tax type guards", () => {
  it("PbpTaxTreatment has 4 values", () => {
    expect(PBP_TAX_TREATMENTS).toHaveLength(4);
  });

  it("isPbpTaxTreatment validates", () => {
    expect(isPbpTaxTreatment("not-declared")).toBe(true);
    expect(isPbpTaxTreatment("gross")).toBe(true);
    expect(isPbpTaxTreatment("net")).toBe(true);
    expect(isPbpTaxTreatment("vat-included")).toBe(true);
    expect(isPbpTaxTreatment("inclusive")).toBe(false);
  });
});

describe("RFC-0451: Fulfillment type guards", () => {
  it("PbpFulfillmentMode has 5 values", () => {
    expect(PBP_FULFILLMENT_MODES).toHaveLength(5);
  });

  it("isPbpFulfillmentMode validates", () => {
    expect(isPbpFulfillmentMode("digital-delivery")).toBe(true);
    expect(isPbpFulfillmentMode("physical-shipping")).toBe(true);
    expect(isPbpFulfillmentMode("pickup")).toBe(true);
    expect(isPbpFulfillmentMode("unknown")).toBe(false);
  });
});

describe("RFC-0438: Terms type guards", () => {
  it("PbpRenewalMode has 3 values", () => {
    expect(PBP_RENEWAL_MODES).toHaveLength(3);
  });

  it("isPbpRenewalMode validates", () => {
    expect(isPbpRenewalMode("automatic")).toBe(true);
    expect(isPbpRenewalMode("manual")).toBe(true);
    expect(isPbpRenewalMode("none")).toBe(true);
    expect(isPbpRenewalMode("unknown")).toBe(false);
  });
});

describe("RFC-0429: Offering type guards", () => {
  it("PbpAvailabilityMode has 3 values", () => {
    expect(PBP_AVAILABILITY_MODES).toHaveLength(3);
  });

  it("isPbpAvailabilityMode validates", () => {
    expect(isPbpAvailabilityMode("declared")).toBe(true);
    expect(isPbpAvailabilityMode("on-request")).toBe(true);
    expect(isPbpAvailabilityMode("unavailable")).toBe(true);
    expect(isPbpAvailabilityMode("unknown")).toBe(false);
  });

  it("PbpOfferingRelation has 5 values", () => {
    expect(PBP_OFFERING_RELATIONS).toHaveLength(5);
  });

  it("isPbpOfferingRelation validates", () => {
    expect(isPbpOfferingRelation("optional")).toBe(true);
    expect(isPbpOfferingRelation("requires")).toBe(true);
    expect(isPbpOfferingRelation("included")).toBe(true);
    expect(isPbpOfferingRelation("unknown")).toBe(false);
  });
});

describe("RFC-0440: ComparisonProfile type guards", () => {
  it("PbpComparisonValueType has 5 values", () => {
    expect(PBP_COMPARISON_VALUE_TYPES).toHaveLength(5);
  });

  it("isPbpComparisonValueType validates", () => {
    expect(isPbpComparisonValueType("money")).toBe(true);
    expect(isPbpComparisonValueType("duration")).toBe(true);
    expect(isPbpComparisonValueType("controlled-value")).toBe(true);
    expect(isPbpComparisonValueType("unknown")).toBe(false);
  });
});

describe("RFC-0454: Comparison projection type guards", () => {
  it("PbpComparisonStatus has 3 values", () => {
    expect(PBP_COMPARISON_STATUSES).toHaveLength(3);
  });

  it("isPbpComparisonStatus validates", () => {
    expect(isPbpComparisonStatus("comparable")).toBe(true);
    expect(isPbpComparisonStatus("incomparable")).toBe(true);
    expect(isPbpComparisonStatus("missing")).toBe(true);
    expect(isPbpComparisonStatus("unknown")).toBe(false);
  });
});

describe("RFC-0421: Runtime overlay type guards", () => {
  it("PbpOverlayStaleBehavior has 4 values", () => {
    expect(PBP_OVERLAY_STALE_BEHAVIORS).toHaveLength(4);
  });

  it("isPbpOverlayStaleBehavior validates", () => {
    expect(isPbpOverlayStaleBehavior("omit")).toBe(true);
    expect(isPbpOverlayStaleBehavior("show-unknown")).toBe(true);
    expect(isPbpOverlayStaleBehavior("show-stale-warning")).toBe(true);
    expect(isPbpOverlayStaleBehavior("block-transaction")).toBe(true);
    expect(isPbpOverlayStaleBehavior("unknown")).toBe(false);
  });
});

describe("RFC-0422: Validation error type guards", () => {
  it("PbpValidationSeverity has 4 values", () => {
    expect(PBP_VALIDATION_SEVERITIES).toHaveLength(4);
  });

  it("isPbpValidationSeverity validates", () => {
    expect(isPbpValidationSeverity("fatal")).toBe(true);
    expect(isPbpValidationSeverity("error")).toBe(true);
    expect(isPbpValidationSeverity("warning")).toBe(true);
    expect(isPbpValidationSeverity("info")).toBe(true);
    expect(isPbpValidationSeverity("unknown")).toBe(false);
  });

  it("PbpErrorPrefix has 15 values", () => {
    expect(PBP_ERROR_PREFIXES).toHaveLength(15);
  });

  it("isPbpErrorPrefix validates", () => {
    expect(isPbpErrorPrefix(PBP_ERROR_PREFIXES[0])).toBe(true);
    expect(isPbpErrorPrefix("unknown")).toBe(false);
  });
});

describe("RFC-0459: Signature type guards", () => {
  it("PbpSignatureAlgorithm has 3 values", () => {
    expect(PBP_SIGNATURE_ALGORITHMS).toHaveLength(3);
  });

  it("isPbpSignatureAlgorithm validates", () => {
    expect(isPbpSignatureAlgorithm("ed25519")).toBe(true);
    expect(isPbpSignatureAlgorithm("rsa-pss-sha256")).toBe(true);
    expect(isPbpSignatureAlgorithm("ecdsa-p256-sha256")).toBe(true);
    expect(isPbpSignatureAlgorithm("unknown")).toBe(false);
  });
});

describe("RFC-0434: MachineUsePolicy type guards", () => {
  it("PbpMachineUsePermission has 11 values", () => {
    expect(PBP_MACHINE_USE_PERMISSIONS).toHaveLength(11);
  });

  it("isPbpMachineUsePermission validates", () => {
    expect(isPbpMachineUsePermission(PBP_MACHINE_USE_PERMISSIONS[0])).toBe(true);
    expect(isPbpMachineUsePermission("unknown")).toBe(false);
  });

  it("PbpMachineUseVerdict has 3 values", () => {
    expect(PBP_MACHINE_USE_VERDICTS).toHaveLength(3);
  });

  it("isPbpMachineUseVerdict validates", () => {
    expect(isPbpMachineUseVerdict("allowed")).toBe(true);
    expect(isPbpMachineUseVerdict("denied")).toBe(true);
    expect(isPbpMachineUseVerdict("conditional")).toBe(true);
    expect(isPbpMachineUseVerdict("unknown")).toBe(false);
  });
});

describe("RFC-0449: Ownership type guards", () => {
  it("PbpAssetHolder has 3 values", () => {
    expect(PBP_ASSET_HOLDERS).toHaveLength(3);
  });

  it("isPbpAssetHolder validates", () => {
    expect(isPbpAssetHolder("customer")).toBe(true);
    expect(isPbpAssetHolder("third-party")).toBe(true);
    expect(isPbpAssetHolder("provider")).toBe(true);
    expect(isPbpAssetHolder("business")).toBe(false);
  });
});

describe("Entity vocabulary type guards", () => {
  it("isPbpDisclosureKind validates", () => {
    expect(isPbpDisclosureKind("technology-dependency")).toBe(true);
    expect(isPbpDisclosureKind("data-processing")).toBe(true);
    expect(isPbpDisclosureKind("ownership-change")).toBe(true);
    expect(isPbpDisclosureKind("regulatory")).toBe(true);
    expect(isPbpDisclosureKind("technology")).toBe(false);
  });

  it("isPbpDisclosureMateriality validates", () => {
    expect(isPbpDisclosureMateriality("informative")).toBe(true);
    expect(isPbpDisclosureMateriality("material")).toBe(true);
    expect(isPbpDisclosureMateriality("critical")).toBe(true);
    expect(isPbpDisclosureMateriality("unknown")).toBe(false);
  });

  it("isPbpCredentialKind validates", () => {
    expect(isPbpCredentialKind("certification")).toBe(true);
    expect(isPbpCredentialKind("license")).toBe(true);
    expect(isPbpCredentialKind("unknown")).toBe(false);
  });

  it("isPbpReviewContentMode validates", () => {
    expect(isPbpReviewContentMode("excerpt")).toBe(true);
    expect(isPbpReviewContentMode("full")).toBe(true);
    expect(isPbpReviewContentMode("unknown")).toBe(false);
  });

  it("isPbpDocumentKind validates", () => {
    expect(isPbpDocumentKind("privacy-policy")).toBe(true);
    expect(isPbpDocumentKind("imprint")).toBe(true);
    expect(isPbpDocumentKind("unknown")).toBe(false);
  });

  it("isPbpEvidenceKind validates", () => {
    expect(isPbpEvidenceKind("external-web-sources")).toBe(true);
    expect(isPbpEvidenceKind("verified-record")).toBe(true);
    expect(isPbpEvidenceKind("third-party-registry")).toBe(true);
    expect(isPbpEvidenceKind("measurement")).toBe(false);
  });

  it("isPbpContactChannel validates", () => {
    expect(isPbpContactChannel("email")).toBe(true);
    expect(isPbpContactChannel("phone")).toBe(true);
    expect(isPbpContactChannel("unknown")).toBe(false);
  });

  it("isPbpWebPresenceKind validates", () => {
    expect(isPbpWebPresenceKind("primary-website")).toBe(true);
    expect(isPbpWebPresenceKind("unknown")).toBe(false);
  });

  it("isPbpWebControlStatus validates", () => {
    expect(isPbpWebControlStatus("business-controlled")).toBe(true);
    expect(isPbpWebControlStatus("unknown")).toBe(false);
  });

  it("isPbpPlaceKind validates", () => {
    expect(isPbpPlaceKind("locality")).toBe(true);
    expect(isPbpPlaceKind("region")).toBe(true);
    expect(isPbpPlaceKind("country")).toBe(true);
    expect(isPbpPlaceKind("unknown")).toBe(false);
  });
});

describe("Infrastructure type guards", () => {
  it("isPbpDependencyInvalidationRule validates", () => {
    expect(isPbpDependencyInvalidationRule("policy-change-invalidates-offerings")).toBe(true);
    expect(isPbpDependencyInvalidationRule("unknown")).toBe(false);
  });

  it("isPbpNormalizationDecision validates", () => {
    expect(isPbpNormalizationDecision("transformed")).toBe(true);
    expect(isPbpNormalizationDecision("derived-not-stored")).toBe(true);
    expect(isPbpNormalizationDecision("extracted")).toBe(false);
  });

  it("isPbpRegistryKind validates", () => {
    expect(isPbpRegistryKind("category")).toBe(true);
    expect(isPbpRegistryKind("unknown")).toBe(false);
  });

  it("isPbpCompilerPhase validates", () => {
    expect(isPbpCompilerPhase("discover")).toBe(true);
    expect(isPbpCompilerPhase("parse")).toBe(true);
    expect(isPbpCompilerPhase("unknown")).toBe(false);
  });

  it("isPbpBuildStrictness validates", () => {
    expect(isPbpBuildStrictness("production")).toBe(true);
    expect(isPbpBuildStrictness("migration")).toBe(true);
    expect(isPbpBuildStrictness("unknown")).toBe(false);
  });

  it("isPbpDerivationStatus validates", () => {
    expect(isPbpDerivationStatus("derived")).toBe(true);
    expect(isPbpDerivationStatus("skipped")).toBe(true);
    expect(isPbpDerivationStatus("failed")).toBe(true);
    expect(isPbpDerivationStatus("ok")).toBe(false);
  });

  it("isPbpDerivationMode validates", () => {
    expect(isPbpDerivationMode("exact")).toBe(true);
    expect(isPbpDerivationMode("range")).toBe(true);
    expect(isPbpDerivationMode("parameterized")).toBe(true);
    expect(isPbpDerivationMode("pure")).toBe(false);
  });

  it("isPbpCanonicalSerializationStep validates", () => {
    expect(isPbpCanonicalSerializationStep(PBP_CANONICAL_SERIALIZATION_STEPS[0])).toBe(true);
    expect(isPbpCanonicalSerializationStep("unknown")).toBe(false);
  });
});
