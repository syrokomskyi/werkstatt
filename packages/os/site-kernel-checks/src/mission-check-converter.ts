import type { DeterministicInstrumentResult } from "@syrokomskyi/axiom-study";

export interface FindingYaml {
  severity: "error" | "warning";
  ruleId: string;
  url: string;
  locale: string;
  target: string;
  impact: string;
  description: string;
  help: string;
}

export type InstrumentResult = Omit<DeterministicInstrumentResult, "reused">;

export function convertObservationsToFindings(
  result: InstrumentResult,
  localeMap: Map<string, string>,
): FindingYaml[] {
  const findings: FindingYaml[] = [];

  for (const obs of result.bundle.observations) {
    if (obs.predicate === "accessibility.axe.violation") {
      const value = obs.value as {
        ruleId: string;
        impact: string;
        description: string;
        help: string;
        helpUrl: string;
      };
      const [url, target] = splitSubjectId(obs.subjectId);
      findings.push({
        severity: "error",
        ruleId: value.ruleId,
        url,
        locale: localeMap.get(url) ?? "en",
        target,
        impact: value.impact,
        description: value.description,
        help: value.helpUrl,
      });
    } else if (obs.predicate === "accessibility.axe.incomplete") {
      const value = obs.value as {
        ruleId: string;
        impact: string;
        description: string;
        help: string;
        helpUrl: string;
      };
      const [url, target] = splitSubjectId(obs.subjectId);
      findings.push({
        severity: "warning",
        ruleId: value.ruleId,
        url,
        locale: localeMap.get(url) ?? "en",
        target,
        impact: value.impact,
        description: value.description,
        help: value.helpUrl,
      });
    }
  }

  return findings;
}

function splitSubjectId(subjectId: string): [string, string] {
  const hashIdx = subjectId.indexOf("#");
  if (hashIdx === -1) return [subjectId, ""];
  return [subjectId.slice(0, hashIdx), subjectId.slice(hashIdx + 1)];
}
