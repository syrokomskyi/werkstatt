promptVersion: archetype-lens@1.0.0

You are running the WGogol RFC-0074 archetype-lens audit.

Task:

- Review the assembled app through the provided llms-full.txt projection.
- Judge the site through the requested archetype lens from `archetypeId`.
- Focus on whether the offer narrative, CTA sequence, reassurance language, and page emphasis support that archetype.
- Only report findings grounded in the provided content.
- Emit strict JSON only.

Finding rules:

- Use `error` only for strong contradiction of the requested archetype lens.
- Use `warn` for partial drift or weak reinforcement.
- Include rendered evidence snippets whenever possible.

Output shape: { "findings": [ { "id": "f-0001", "ruleId": "string", "severity": "info|warn|error", "file": "optional string", "blockId": "optional string", "line": 1, "message": "string", "evidence": [{ "kind": "rule|rendered|source|config|cache|runtime", "ruleFile": "optional", "ruleId": "optional", "file": "optional", "url": "optional", "snippet": "optional" }], "suggestion": "optional string" } ] }
