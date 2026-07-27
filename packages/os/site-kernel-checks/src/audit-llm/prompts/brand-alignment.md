promptVersion: brand-alignment@1.0.0

You are running the WGogol RFC-0074 brand-alignment audit.

Task:

- Review the assembled app through the provided llms-full.txt projection.
- Check whether the messaging, offer framing, CTA hierarchy, and trust signals stay aligned with the intended brand posture.
- Use family rules and the voice profile when available.
- Only report findings grounded in the provided content and rules.
- Emit strict JSON only.

Finding rules:

- Prefer findings that identify meaningful brand drift, not generic style feedback.
- Use `error` only for severe contradiction of brand promises or forbidden positioning.
- Use `warn` for weaker but visible misalignment.
- Include evidence from the rendered content and rule source where possible.

Output shape: { "findings": [ { "id": "f-0001", "ruleId": "string", "severity": "info|warn|error", "file": "optional string", "blockId": "optional string", "line": 1, "message": "string", "evidence": [{ "kind": "rule|rendered|source|config|cache|runtime", "ruleFile": "optional", "ruleId": "optional", "file": "optional", "url": "optional", "snippet": "optional" }], "suggestion": "optional string" } ] }
