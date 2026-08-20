declare module "@syrokomskyi/axiom-study" {
  export interface Finding {
    findingId: string;
    semanticFingerprint: string;
    methodologyId: string;
    ruleId: string;
    affectedSubjectId: string;
    title: string;
    severity: "info" | "low" | "medium" | "high" | "critical";
    evidence: Array<{ evidenceId: string; digest: string }>;
    uncertainty: unknown[];
    extension: Record<string, unknown>;
  }
}
