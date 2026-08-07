/*
<MODULE_CONTRACT>
<purpose>PBP Derived Price Materialization — iterates Offerings, Charges, and target currencies to produce materialized derived prices (RFC-0740).</purpose>
<non-goals>
  <item>Does not define the materialized price type — that is in materialized-derived-price.ts.</item>
  <item>Does not implement the currency conversion pipeline — that is RFC-0739 (computeCurrencyConversion).</item>
  <item>Does not write generated files — that is the command handler in site-kernel-checks.</item>
  <item>Does not integrate into the build pipeline — that is RFC-0741.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0740 — materializeDerivedPrices pure function and 5 validation rules (rules 3, 6, 8, 13, 14).</item>
</CHANGE_SUMMARY>
*/

import type { PbpResolvedGraph } from "./types.js";
import type { PbpValidationError } from "../validation-errors.js";
import type { PbpMaterializedDerivedPrice } from "../materialized-derived-price.js";
import type { PbpCurrencyPricingPolicy } from "../entities/currency-pricing-policy.js";
import type { PbpCharge } from "../entities/pricing.js";
import type { PbpExternalCost } from "../entities/pricing.js";
import type { PbpOffering } from "../entities/offering.js";
import type { PbpRatePolicy } from "../entities/rate-policy.js";
import type { PbpRateSnapshot } from "../entities/rate-snapshot.js";
import type { PbpEntityRef } from "../entity-ref.js";
import type { PbpDerivationContract } from "../derivation.js";
import { computeCurrencyConversion } from "../derivations/currency-conversion.js";
import type { PbpCurrencyConversionResult } from "../derivations/currency-conversion.js";
import Big from "big.js";

/**
 * Result of materializing derived prices.
 */
export interface MaterializeDerivedPricesResult {
  prices: Record<string, PbpMaterializedDerivedPrice[]>;
  errors: PbpValidationError[];
}

/**
 * Default pipeline parameters for currency conversion derivation.
 *
 * The materialization command builds a default pipeline with half-up rounding
 * to the target currency's standard decimal places (2 for most currencies).
 * Price ending is not applied by default.
 */
function buildDefaultPipeline(
  sourceAmount: string,
  sourceCurrency: string,
  targetCurrency: string,
): {
  conversion: { sourceAmount: string; sourceCurrency: string; targetCurrency: string };
  rounding: { mode: "half-up"; decimalPlaces: number };
} {
  const decimalPlaces = targetCurrency === "JPY" || targetCurrency === "KRW" ? 0 : 2;
  return {
    conversion: { sourceAmount, sourceCurrency, targetCurrency },
    rounding: { mode: "half-up", decimalPlaces },
  };
}

/**
 * Resolve an entity ref to a string key.
 *
 * `PbpEntityRef` can be either a plain string or an object `{ ref: string }`.
 * This helper normalises both forms to a string.
 */
function resolveRef(ref: PbpEntityRef): string {
  if (typeof ref === "string") return ref;
  return (ref as { ref: string }).ref;
}

/**
 * Find the applicable rate snapshot for a currency pair.
 *
 * Searches `graph.rateSnapshots` for a snapshot matching the source and target
 * currency, with `freshUntil` >= `now`. Stale snapshots (freshUntil < now) are
 * not returned — `allowLastKnownValue` from the rate policy is handled by the
 * caller, not this function.
 */
function findApplicableSnapshot(
  graph: PbpResolvedGraph,
  sourceCurrency: string,
  targetCurrency: string,
  now: string,
): PbpRateSnapshot | undefined {
  const snapshots = Object.entries(graph.rateSnapshots)
    .filter(
      ([, snap]) =>
        snap.pair.sourceCurrency === sourceCurrency && snap.pair.targetCurrency === targetCurrency,
    )
    .sort(([, a], [, b]) => b.observedAt.localeCompare(a.observedAt));

  for (const [, snap] of snapshots) {
    if (snap.freshUntil >= now) {
      return snap;
    }
  }

  return undefined;
}

/**
 * Find the rate policy for a currency pair.
 */
function findRatePolicy(
  graph: PbpResolvedGraph,
  sourceCurrency: string,
  targetCurrency: string,
): PbpRatePolicy | undefined {
  return Object.values(graph.ratePolicies).find(
    (rp) => rp.pair.sourceCurrency === sourceCurrency && rp.pair.targetCurrency === targetCurrency,
  );
}

/**
 * Build a currency conversion derivation contract for a charge.
 *
 * Double-cast: `PbpDerivationContract.parameters` is `Record<string, unknown>`,
 * but we need to pass the structured pipeline object. The object structurally
 * matches `PbpCurrencyConversionDerivation`, but `PbpDerivationContract`'s typed
 * parameters field doesn't enforce the inner shape.
 */
function buildConversionContract(
  ratePolicyRef: string,
  rateSnapshotRef: string,
  sourceAmount: string,
  sourceCurrency: string,
  targetCurrency: string,
): PbpDerivationContract {
  const pipeline = buildDefaultPipeline(sourceAmount, sourceCurrency, targetCurrency);
  return {
    derivationRef: "currency-conversion",
    contractVersion: "1",
    implementationVersion: "1",
    requiredInputs: ["sourceAmount", "sourceCurrency", "targetCurrency", "rateSnapshotRef"],
    parameters: {
      ratePolicyRef: { ref: ratePolicyRef },
      rateSnapshotRef: { ref: rateSnapshotRef },
      pipeline,
    },
  } as unknown as PbpDerivationContract;
}

/**
 * Materialize derived prices for all Offerings in the compiled graph.
 *
 * Iterates Offerings (sorted by key), Charges (sorted by key), and target
 * currencies (sorted by key). For each fixed charge in each target currency
 * with `strategy: "derived"`, runs the currency conversion derivation and
 * creates a `PbpMaterializedDerivedPrice` if successful.
 *
 * Skips gracefully:
 * - Offerings without `pricing` or `pricing.charges`
 * - Charges where `amount.model` is not `"fixed"`
 * - Target currencies with `strategy: "fixed"`
 *
 * @see RFC-0740 §3 (derived-prices.materialize command)
 */
export function materializeDerivedPrices(
  graph: PbpResolvedGraph,
  policy: PbpCurrencyPricingPolicy,
  buildTime: string,
): MaterializeDerivedPricesResult {
  const prices: Record<string, PbpMaterializedDerivedPrice[]> = {};
  const errors: PbpValidationError[] = [];

  const offeringKeys = Object.keys(graph.offerings).sort();

  for (const offeringKey of offeringKeys) {
    const offering = graph.offerings[offeringKey];
    const pricing = offering.pricing;
    if (!pricing || (!pricing.charges && !pricing.externalCosts)) {
      continue;
    }

    const sourceCurrency = pricing.currency;
    const chargeKeys = Object.keys(pricing.charges ?? {}).sort();
    const offeringPrices: PbpMaterializedDerivedPrice[] = [];

    for (const chargeKey of chargeKeys) {
      const charge = pricing.charges?.[chargeKey] as PbpCharge | undefined;
      if (!charge || !charge.amount || charge.amount.model !== "fixed") {
        continue;
      }

      const sourceAmount = charge.amount.value;

      const targetKeys = Object.keys(policy.targetCurrencies).sort();
      for (const targetKey of targetKeys) {
        const target = policy.targetCurrencies[targetKey];
        const targetCurrency = target.currency;

        if (target.strategy === "fixed") {
          continue;
        }

        const validationErrors = validateTarget(
          sourceCurrency,
          targetCurrency,
          offering,
          chargeKey,
        );
        if (validationErrors.length > 0) {
          errors.push(...validationErrors);
          continue;
        }

        const ratePolicy = findRatePolicy(graph, sourceCurrency, targetCurrency);
        if (!ratePolicy) {
          errors.push({
            code: "PBP-DERIVED-PRICE-03",
            severity: "error",
            entityId: offering.id,
            path: `pricing.charges.${chargeKey}`,
            message: `strategy: derived but no RatePolicy for pair ${sourceCurrency}/${targetCurrency}`,
          });
          continue;
        }

        const snapshot = findApplicableSnapshot(graph, sourceCurrency, targetCurrency, buildTime);
        if (!snapshot) {
          if (ratePolicy.failure.noAcceptableRate === "block-publication") {
            errors.push({
              code: "PBP-DERIVED-PRICE-08",
              severity: "error",
              entityId: offering.id,
              path: `pricing.charges.${chargeKey}`,
              message: `No applicable rate snapshot for pair ${sourceCurrency}/${targetCurrency}`,
            });
          }
          continue;
        }

        const ratePolicyRef = resolveRef(target.ratePolicyRef ?? { ref: ratePolicy.id });
        const snapshotRef = snapshot.id;
        const contract = buildConversionContract(
          ratePolicyRef,
          snapshotRef,
          sourceAmount,
          sourceCurrency,
          targetCurrency,
        );

        const result: PbpCurrencyConversionResult = computeCurrencyConversion(
          graph,
          contract,
          buildTime,
        );

        if (result.status === "failed") {
          errors.push({
            code: "PBP-DERIVED-PRICE-CONVERSION",
            severity: "error",
            entityId: offering.id,
            path: `pricing.charges.${chargeKey}`,
            message: result.formulaDescription ?? "Currency conversion failed",
          });
          continue;
        }

        if (result.status === "skipped") {
          continue;
        }

        if (!result.value || !result.trace) {
          continue;
        }

        const postValidationErrors = validateDerivedPrice(
          result,
          sourceAmount,
          offering.id,
          chargeKey,
        );
        if (postValidationErrors.length > 0) {
          errors.push(...postValidationErrors);
          continue;
        }

        const derivedPrice: PbpMaterializedDerivedPrice = {
          chargeRef: chargeKey,
          targetCurrency,
          amount: {
            value: result.value.amount,
            currency: result.value.currency,
          },
          priceKind: "derived",
          commercialMeaning: "derived-price",
          derivation: {
            modelRef: `pbp-derivation:currency-conversion/${contract.implementationVersion}`,
            modelVersion: contract.implementationVersion,
            calculatedAt: buildTime,
          },
          trace: result.trace,
          allowedUses: target.currentUses,
        };

        offeringPrices.push(derivedPrice);
      }
    }

    const externalCostKeys = Object.keys(pricing.externalCosts ?? {}).sort();
    for (const costKey of externalCostKeys) {
      const cost = pricing.externalCosts?.[costKey] as PbpExternalCost | undefined;
      if (!cost) continue;
      const sourceAmount = externalCostAmount(cost);
      if (sourceAmount === null) continue;

      const targetKeys = Object.keys(policy.targetCurrencies).sort();
      for (const targetKey of targetKeys) {
        const target = policy.targetCurrencies[targetKey];
        const targetCurrency = target.currency;

        if (target.strategy === "fixed") continue;

        const validationErrors = validateTarget(sourceCurrency, targetCurrency, offering, costKey);
        if (validationErrors.length > 0) {
          errors.push(...validationErrors);
          continue;
        }

        const ratePolicy = findRatePolicy(graph, sourceCurrency, targetCurrency);
        if (!ratePolicy) {
          errors.push({
            code: "PBP-DERIVED-PRICE-03",
            severity: "error",
            entityId: offering.id,
            path: `pricing.externalCosts.${costKey}`,
            message: `strategy: derived but no RatePolicy for pair ${sourceCurrency}/${targetCurrency}`,
          });
          continue;
        }

        const snapshot = findApplicableSnapshot(graph, sourceCurrency, targetCurrency, buildTime);
        if (!snapshot) {
          if (ratePolicy.failure.noAcceptableRate === "block-publication") {
            errors.push({
              code: "PBP-DERIVED-PRICE-08",
              severity: "error",
              entityId: offering.id,
              path: `pricing.externalCosts.${costKey}`,
              message: `No applicable rate snapshot for pair ${sourceCurrency}/${targetCurrency}`,
            });
          }
          continue;
        }

        const ratePolicyRef = resolveRef(target.ratePolicyRef ?? { ref: ratePolicy.id });
        const snapshotRef = snapshot.id;
        const contract = buildConversionContract(
          ratePolicyRef,
          snapshotRef,
          sourceAmount,
          sourceCurrency,
          targetCurrency,
        );

        const result: PbpCurrencyConversionResult = computeCurrencyConversion(
          graph,
          contract,
          buildTime,
        );

        if (result.status === "failed") {
          errors.push({
            code: "PBP-DERIVED-PRICE-CONVERSION",
            severity: "error",
            entityId: offering.id,
            path: `pricing.externalCosts.${costKey}`,
            message: result.formulaDescription ?? "Currency conversion failed",
          });
          continue;
        }

        if (result.status === "skipped") continue;
        if (!result.value || !result.trace) continue;

        const postValidationErrors = validateDerivedPrice(
          result,
          sourceAmount,
          offering.id,
          costKey,
        );
        if (postValidationErrors.length > 0) {
          errors.push(...postValidationErrors);
          continue;
        }

        const derivedPrice: PbpMaterializedDerivedPrice = {
          chargeRef: costKey,
          targetCurrency,
          amount: {
            value: result.value.amount,
            currency: result.value.currency,
          },
          priceKind: "derived",
          commercialMeaning: "derived-price",
          derivation: {
            modelRef: `pbp-derivation:currency-conversion/${contract.implementationVersion}`,
            modelVersion: contract.implementationVersion,
            calculatedAt: buildTime,
          },
          trace: result.trace,
          allowedUses: target.currentUses,
        };

        offeringPrices.push(derivedPrice);
      }
    }

    if (offeringPrices.length > 0) {
      prices[offering.id] = offeringPrices;
    }
  }

  return { prices, errors };
}

/**
 * Extract the source amount from an external cost.
 * Only fixed and cap models are convertible; range is skipped.
 */
function externalCostAmount(cost: PbpExternalCost): string | null {
  if (cost.amount.model === "fixed" || cost.amount.model === "cap") {
    return cost.amount.value;
  }
  return null;
}

/**
 * Pre-materialization validation for a single target currency.
 *
 * Checks rule 6 (same source and target currency) from RFC-0740 §4.
 */
function validateTarget(
  sourceCurrency: string,
  targetCurrency: string,
  offering: PbpOffering,
  chargeKey: string,
): PbpValidationError[] {
  const errors: PbpValidationError[] = [];

  if (sourceCurrency === targetCurrency) {
    errors.push({
      code: "PBP-DERIVED-PRICE-06",
      severity: "error",
      entityId: offering.id,
      path: `pricing.charges.${chargeKey}`,
      message: `Source and target currency are the same: ${sourceCurrency}`,
    });
  }

  return errors;
}

/**
 * Post-materialization validation for a derived price.
 *
 * Checks rules 13 (negative result) and 14 (zero result for positive source)
 * from RFC-0740 §4.
 */
function validateDerivedPrice(
  result: PbpCurrencyConversionResult,
  sourceAmount: string,
  entityId: string,
  chargeKey: string,
): PbpValidationError[] {
  const errors: PbpValidationError[] = [];

  if (!result.value) return errors;

  const finalAmount = result.value.amount;

  if (finalAmount.startsWith("-")) {
    errors.push({
      code: "PBP-DERIVED-PRICE-13",
      severity: "error",
      entityId,
      path: `pricing.charges.${chargeKey}`,
      message: `Derived result is negative: ${finalAmount}`,
    });
  }

  if (Big(finalAmount).abs().eq(0) && Big(sourceAmount).gt(0)) {
    errors.push({
      code: "PBP-DERIVED-PRICE-14",
      severity: "error",
      entityId,
      path: `pricing.charges.${chargeKey}`,
      message: `Derived result is zero for positive source price: ${sourceAmount}`,
    });
  }

  return errors;
}
