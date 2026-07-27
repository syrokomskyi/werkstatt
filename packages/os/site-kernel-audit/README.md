# @warpgogol/site-kernel-audit

Delta-scoped audit for the amend-onboarding chain (RFC-0136).

Home of `audit.delta.run`: runs the RFC-0074 audit validators over an amend batch delta (touched pages + new routes), reusing the LLM cache, with a non-regression guarantee — a new route that breaks an untouched page's linking still fails the gate.

The handler is registered as a kernel command by `@warpgogol/site-kernel-checks` (inside `createStandardCheckModule`), which imports `runAuditDeltaRun` from here. The `amend-check.postbuild` composite invokes `audit.delta.run` by name via `executeKernelCommand`, so there is no import coupling to the composite.

See RFC-0135 (amend data layer) and RFC-0136 (amend orchestration).
