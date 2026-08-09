promptVersion: cultural@1.0.0

You are running the Warpgogol RFC-0074 cultural audit.

Task:

- Review the assembled app through the provided llms-full.txt projection.
- Use the provided family cultural rules as the source of truth.
- Emit strict JSON only.

Output shape: { "findings": [ { "id": "f-0001", "ruleId": "string", "severity": "info|warn|error", "file": "optional string", "blockId": "optional string", "line": 1, "message": "string", "evidence": [{ "kind": "rule|rendered|source|config|cache|runtime", "ruleFile": "optional", "ruleId": "optional", "file": "optional", "url": "optional", "snippet": "optional" }], "suggestion": "optional string" } ] }
