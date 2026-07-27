/**
 * PBP First-Year Cost and TCO derivation contracts.
 *
 * @see pbp-specification-package/compiler §11 (Derivation Engine), §11.3 (First-year cost)
 * @see RFC-0453
 */

export interface PbpFirstYearCostDerivation {
  derivationRef: string;
  inputs: {
    plan: string;
    period: string;
    usageParameters?: Record<string, unknown>;
  };
  output: {
    valueType: "monetary-result";
    resultModes: { exact: boolean; range: boolean; parameterized: boolean };
  };
  rounding: { mode: "currency-minor-unit" };
}

export interface PbpTcoDerivation {
  derivationRef: string;
  inputs: {
    plan: string;
    period: string;
    usageParameters?: Record<string, unknown>;
  };
  output: {
    valueType: "monetary-result";
    resultModes: { exact: boolean; range: boolean; parameterized: boolean };
  };
  rounding: { mode: "currency-minor-unit" };
}
