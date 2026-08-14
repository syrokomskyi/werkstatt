---
id: agent-native-spatiotemporal-runtime
title: "Agent-native spatiotemporal runtime for Werkstatt"
createdAt: 2026-08-14
status: explored
related: []
---

# Exploration: Agent-native spatiotemporal runtime for Werkstatt

## Idea

Assess what Werkstatt should adopt from DeepSeek Harness and Cordis if the platform is designed for AI agents, may be rewritten without legacy compatibility, and should eventually let agents inspect, extend, test, replace, and promote their own operating capabilities.

The sources reviewed on 2026-08-14 were:

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) and its [architecture](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)
- the [dynamic Cordis toolset](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/extensions/tool-cordis) and [host runner](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/extensions/cordis-host-runner)
- the [Cordis implementation](https://github.com/cordiverse/cordis)
- the preprint [A Programming Paradigm for Spatiotemporal Composability](https://github.com/cordiverse/paper)

### Source correction

The viral summary is directionally useful but combines several distinct facts:

- `deepseek-ai/deepseek-harness` is the practical agent harness and had about 87.9k GitHub stars when reviewed. It is explicitly a developer preview with compatibility-breaking changes expected.
- Cordis predates the DeepSeek Harness repository and is the plugin runtime now used underneath it.
- The paper formalizes **temporal composability** (effects can be withdrawn) and **spatial composability** (dependencies react to providers appearing or disappearing).
- The paper does not validate self-evolving agent harnesses experimentally. Its conclusion names that use case as future validation. The production case study is Koishi's plugin ecosystem.
- DeepSeek's self-modification facility is opt-in. Dynamic Packages are process-local, do not edit source or configuration, do not survive restart, and have no automatic promotion path. Its own documentation treats model-written host code as shell-equivalent trust; `node:vm` is correctness-oriented containment, not a security boundary.

## Codebase findings

### Werkstatt already has useful foundations

- `packages/werkstatt/src/kernel/types.ts` defines typed commands with `mutatesState`, `requiresNetwork`, `reads`, `writes`, gates, output validation, and runtime IO. These fields are a strong starting point for a capability and effect manifest.
- `WorkspaceIO`, dry-run recording, file intents, locks, idempotency, and atomic staging already constrain state mutation (DNA-51).
- Missions, immutable release artifacts, behavior snapshots, evidence, and sequential deployment channels already provide a durable promotion and rollback substrate (DNA-46..53, DNA-59, DNA-73).
- Bordbuch is an append-only, hash-chained operational history. It can become the durable event log for component definitions, activations, failures, demotions, and promotions.
- The engine/plugin split and profile binding established by RFC-0769/RFC-0770 are directionally compatible with a profile/bundle composition model.

### The current plugin system is not Cordis-like

- `KernelModule.register()` returns `void`; `KernelRegistry` can add commands and pipelines but cannot unregister them. Registrations are not lifecycle-owned effects.
- `buildRegistry()` loads configured modules into a fresh registry, mostly sequentially. `registry-cache.ts` then retains that registry for the process lifetime until an explicit clear. There is no incremental reconciliation or provider-driven activation.
- `moduleLoaders` are dynamic imports syntactically, but their composition is fixed in `tools/kernel.config.ts`. Dynamic import is not dynamic composition.
- `buildRegistry()` explicitly skips `werkstatt/plugin@1` objects. The actual kernel modules from `werkstatt-site` are also listed separately in the root config.
- Outside tests and declarations, `createPluginRegistry()` and the lifecycle hook invocation helpers have no runtime callers. The five hook contract is therefore currently more validation surface than execution substrate.
- `WerkstattPlugin` is a coarse stack bundle with one-plugin-per-workshop semantics, optional fixed hooks, and an `unknown` deploy adapter factory. It does not express many independently replaceable services, versioned dependency contracts, effect ownership, drain behavior, or health.
- RFC-0770 deliberately closed the hook list and prohibited multiple plugins. That decision optimizes a static engine/stack boundary, not continuous agent-driven recomposition.

### What DeepSeek/Cordis contributes that Werkstatt lacks

1. **Lifecycle-owned effects.** Every registration and acquired resource belongs to a fiber and has a disposer. Unloading recursively unwinds effects and awaits quiescence.
2. **Reactive dependencies.** Components declare required services; they wait when providers are absent, activate when providers appear, and deactivate before a provider is withdrawn.
3. **Desired-state composition.** Stable row ids, nested plugin trees, configuration overlays, and incremental reconciliation make the running topology data-driven.
4. **Live runtime reflection.** The agent can inspect fibers, services, tools, events, APIs, and its own temporary extensions. Generated API catalogs are freshness-gated against source.
5. **Ephemeral self-extension.** Model-written Packages can be defined, activated, stopped, versioned, and rolled back without restarting the process.
6. **Explicit trust warning.** Dependency injection is capability-shaped but is not a sandbox. Untrusted code needs a process, WebAssembly, container, or equivalent boundary.

### Where Werkstatt must go beyond Cordis

Cordis's inverse model is strongest for in-process resources: registry entries, listeners, timers, child processes, temporary files, connections, and service bindings. Werkstatt also performs external and durable operations that cannot be literally undone: publishing, network emissions, DNS changes, emails, remote deployments, and append-only ledger entries.

Werkstatt therefore needs four effect classes:

| Effect class | Examples | Required contract |
| --- | --- | --- |
| Revertible | registration, listener, timer, lock, temp file, process | disposer, LIFO teardown, quiescence |
| Transactional | local state, registry update, database write | prepare/commit/abort, idempotency key |
| Compensatable | DNS update, remote mutation, deployment | compensating action plus evidence of equivalence |
| Irreversible emission | publish, email, external notification | withheld until commit boundary; never represented as safely reversible |

This distinction fits the existing mission/release boundary better than treating every side effect as an inverse closure.

## Options

### Option 1: Add reversible registrations to the existing kernel

- **Approach:** Make command, pipeline, adapter, and event registration return disposers; add module lifecycle state and registry invalidation while retaining `werkstatt/plugin@1`, fixed hooks, and root `kernel.config.ts` composition.
- **Trade-offs:** Lowest conceptual disruption and immediately improves tests/HMR. It leaves two competing abstractions: a coarse static stack plugin plus fine-grained dynamic modules. Reactive service dependencies, agent reflection, immutable runtime versions, and durable promotion would still be separate later projects.
- **DNA alignment:** Strengthens DNA-51 and preserves DNA-64 unchanged.
- **Blockers:** Define teardown ordering, in-flight command draining, and registry concurrency. A superseding RFC is required because RFC-0770 closes the hook list and fixes one plugin per workshop.
- **Estimated effort:** Medium.

### Option 2: Put Cordis underneath the existing Werkstatt APIs

- **Approach:** Use Cordis fibers, effects, loader, dependency injection, and HMR as the runtime substrate. Re-express each KernelModule as a Cordis component while preserving current command definitions and mission/release APIs at the outer surface.
- **Trade-offs:** Reuses a working implementation and its formal model. The adapter layer would preserve current concepts that were designed for static registration, creating significant semantic impedance. Werkstatt would inherit Cordis's string-key/versioning limitations, Node-centric in-process trust model, and rapidly moving upstream API.
- **DNA alignment:** Can preserve DNA-46..53 and reinterpret DNA-64 as a top-level bundle/profile boundary.
- **Blockers:** Benchmark Cordis under hundreds of commands; prove deterministic teardown and cross-platform behavior; define versioned service keys; isolate untrusted components; determine whether the upstream license/API/release posture is acceptable.
- **Estimated effort:** Large.

### Option 3: Rewrite Werkstatt as a two-plane agent-native component runtime

- **Approach:** Adopt Cordis's semantics but design Werkstatt's own runtime around its mission, evidence, and release strengths. Keep a minimal protected **Law Kernel** and make the capability plane dynamically composable. Replace fixed hooks with typed services, events, and lifecycle-owned effects. Add an evolution controller that manages immutable candidate versions from temporary activation through evidence-backed promotion.
- **Trade-offs:** Best fit for an agent-operated platform and removes the current static/dynamic mismatch. It is a true architectural rewrite and demands crisp decisions on trust, effect boundaries, compatibility, and autonomous promotion before implementation.
- **DNA alignment:** Preserves and deepens DNA-46..53, DNA-59, and DNA-73. Supersedes the current form of DNA-64: one stack profile remains the workshop's top-level identity, but a profile composes many independently replaceable components rather than exactly one monolithic runtime plugin.
- **Blockers:** Define the Law Kernel boundary, capability schema, isolation model, promotion policy, conformance suite, and cutover strategy. Requires a program RFC plus child RFCs.
- **Estimated effort:** Large.

Recommended shape:

```text
Law Kernel (not hot-patchable by the running agent)
  identity · capability grants · isolation · locks · audit · artifact store
  candidate verification · activation transaction · rollback · kill switch
                              |
                              v
Dynamic capability plane
  commands · pipelines · validators · adapters · tools · prompts · schedulers
  each component: provide/require + effects + health + version + permissions
                              |
                              v
Evolution controller
  inspect -> define immutable candidate -> shadow -> test -> canary
          -> activate -> observe -> promote or rollback/quarantine
```

The Law Kernel is not ordinary business functionality. It is the minimum trusted computing base that prevents an agent from redefining the evidence, permissions, locks, or promotion test used to approve its own code.

### Option 4: Fork DeepSeek Harness and make Werkstatt a bundle/profile

- **Approach:** Adopt DeepSeek Harness as the host product and implement missions, releases, Sternsystem, Forge, and Leitstand as Cordis bundles and services.
- **Trade-offs:** Fastest route to a polished interactive agent runtime and its introspection/UI ecosystem. It inverts product ownership: Werkstatt becomes an extension of a developer-preview agent application whose priorities, client/host split, and trust assumptions differ from a lifecycle platform. The mission/release domain would be rebuilt around someone else's fast-moving core.
- **DNA alignment:** Conflicts with the current meaning of DNA-64 and weakens Werkstatt's independent engine boundary.
- **Blockers:** Product-boundary decision, upstream churn, security review, domain reimplementation, and operational ownership.
- **Estimated effort:** Large.

## Recommendation

Choose **Option 3**: adopt the paradigm, not DeepSeek Harness wholesale.

The key architectural decision is to replace `werkstatt/plugin@1` as the runtime unit. Keep a stack profile/bundle concept for selecting Astro, Phaser, or Editframe composition, but let that bundle expand into a graph of small typed components. Commands, validators, deploy adapters, agent tools, prompt contributors, schedulers, and observers should all use the same lifecycle.

### Contracts worth adopting

1. **Every registration returns a disposer.** No direct mutation of global registries.
2. **Every component has a fiber/state machine:** `declared -> waiting -> loading -> active -> draining -> unloading -> disposed`, with `failed` and `quarantined` terminal/error states.
3. **Dependencies are declared and versioned.** Use namespaced contract ids plus compatibility ranges or schema hashes, not bare string keys alone.
4. **Providers drain dependents before teardown.** New calls stop before resources disappear; in-flight calls either complete or reach a declared cancellation boundary.
5. **Composition is desired state.** Stable ids and layered patches reconcile a live graph; file edits are one source of desired state, not the runtime model itself.
6. **Dynamic code is immutable by version.** An agent appends a candidate Package; it never overwrites the running source in place. `current`, `candidate`, and rollback pointers remain explicit.
7. **Temporary and durable lifetimes are separate.** Session/process-local Packages are cheap experiments. Persistence requires materialization into a content-addressed artifact and passage through promotion gates.
8. **Reflection is generated and live-filtered.** A behavior/capability catalog is generated from source contracts, freshness-gated, then intersected with the actual running graph.
9. **Capability declarations are not treated as isolation.** Trusted first-party components may run in-process; agent-written or third-party components run in a stronger boundary with an attenuated capability bridge.
10. **All model-visible and governance-relevant changes are logged.** Bordbuch records definitions, activations, grants, failures, rollback, quarantine, and promotion; large source payloads live in the artifact store by hash.

### What not to copy

- Do not make the whole safety and promotion mechanism self-patchable in the same transaction as a candidate component.
- Do not rely on `node:vm` as the security boundary for autonomous model-written code.
- Do not hot-reload irreversible operations. Stage and commit them through mission/release transactions.
- Do not retain the closed five-hook API or the `unknown` deploy-adapter type.
- Do not let missing dependencies remain silently pending; expose them as structured diagnostics and readiness state.
- Do not accept bare key identity as service compatibility.
- Do not claim automatic self-improvement from the architecture alone. Improvement requires held-out evaluation, deterministic promotion criteria, canaries, attribution, and rollback.

### Suggested program sequence

1. **Runtime semantics RFC:** supersede RFC-0770 and amend DNA-64; define component, fiber, effect classes, dependencies, lifecycle, and protected kernel.
2. **Conformance spike:** reimplement a small vertical slice (command registry, one validator, one deploy adapter, one agent tool) without compatibility shims; test unload, provider replacement, failure, and quiescence.
3. **Evolution plane:** add inspect/define/run/stop/rollback for ephemeral immutable candidates, initially in a separate process or equivalent sandbox.
4. **Promotion plane:** connect candidates to missions, fingerprints, evidence, artifact storage, Bordbuch, shadow evaluation, canary activation, and automatic demotion.
5. **Full cutover:** re-author existing modules as components and delete the static registry/plugin implementation in one forward-only transition.

## Open questions

- Which exact capabilities belong to the protected Law Kernel, and which may a running agent replace?
- Should untrusted components run in subprocesses, worker isolates, WebAssembly, containers, or a tiered combination?
- What evidence lets an agent autonomously promote a candidate: fixed conformance tests, held-out scenarios, statistical regression gates, independent reviewer agents, or all four?
- Are dynamic components scoped per command invocation, mission, agent session, workshop process, or fleet? The runtime likely needs all scopes explicitly.
- Should the first implementation depend on Cordis or use it only as a reference model? A bounded conformance and performance spike should answer this before the program RFC chooses a dependency.
- How are external-effect compensations verified, especially for deployments and DNS where rollback may restore configuration but not erase prior observation?
