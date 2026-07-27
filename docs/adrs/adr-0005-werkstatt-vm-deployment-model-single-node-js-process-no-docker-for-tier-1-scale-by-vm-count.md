---
id: ADR-0005
title: "Werkstatt VM deployment model: single Node.js process, no Docker for Tier 1, scale by VM count"
# Lifecycle (RFC-0367 parity with RFCs):
#   proposed → reviewing → accepted → implemented
#   any → superseded (requires supersededBy)
#   any → rejected
status: accepted
scope: workspace
decider: architecture
createdAt: 2026-07-27
updatedAt: 2026-07-27
implementedAt:
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0555
  - DNA-46
reviewers:
  - human:andrii-syrokomskyi
---

# ADR-0005: Werkstatt VM deployment model: single Node.js process, no Docker for Tier 1, scale by VM count

## Context

RFC-0555 introduces `packages/studio-gate` — a stdio MCP server that enables site owner content editing through mission lifecycle. The studio-gate MCP server needs a production deployment contour: where it runs, how it scales, and what infrastructure surrounds it.

The platform manages sites as Sternsystems (DNA-44) with a one-open-mission-per-Sternsystem constraint (DNA-46). Content editing missions (Tier 1) involve only Markdown/YAML file edits within the DNA-22 client-editable surface — no arbitrary code execution. The threat model for Tier 1 is low: site owners edit their own content through controlled MCP tools with DNA-22 path validation.

## Decision

Each Werkstatt (VM) runs a single Node.js process hosting studio-gate MCP server instances for all sites on that VM, with an in-memory build queue for concurrent mission builds.

- **No Docker containers for Tier 1** (content edits) — the low threat model and DNA-22 path validation make containerization unnecessary overhead.
- **No message brokers** (Hermes, Kafka, Redis) — the one-open-mission-per-Sternsystem constraint (DNA-46) means at most one concurrent mission per site; an in-memory queue is sufficient.
- **Scale by adding VMs** — each VM hosts dozens to hundreds of sites; horizontal scale is achieved by adding more VMs, each with its own `systems/registry.yaml`.

## Justification

**Why no Docker for Tier 1:** Content editing missions only touch Markdown/YAML files within `src/content/` (DNA-22). The `workpiece.read` and `workpiece.write` commands enforce path validation before any file I/O. There is no arbitrary code execution — the LLM cannot run scripts or install packages. Docker adds startup latency, resource overhead, and operational complexity without security benefit for this threat model. Docker becomes necessary for Tier 2 (programmer surface edits with arbitrary code execution), which is a future concern.

**Why no message brokers:** DNA-46 enforces one open mission per Sternsystem at a time. With N sites on a VM, there are at most N concurrent missions, each sequential within its Sternsystem. A simple in-memory semaphore-based build queue (limiting concurrent `mission.build` calls) handles resource contention. Hermes/Kafka/Redis would add operational complexity for a problem that does not exist.

**Why scale by VM count:** Each VM is independent — its own registry, its own studio-gate instances, its own build queue. Adding capacity means provisioning a new VM and registering sites to it. This avoids the complexity of distributed state, cluster coordination, and cross-VM locking. The registry is per-VM, not global, so there is no single bottleneck.

## Consequences

- **Positive:** Minimal infrastructure — one Node.js process, no container runtime, no message broker. Simple to deploy, monitor, and debug. Each VM is self-contained and independently scalable.
- **Positive:** Low operational overhead — no Docker image builds, no container orchestration, no broker maintenance. The operator manages a single process per VM.
- **Positive:** Clear scaling path — capacity is added by provisioning VMs, not by reconfiguring distributed systems.
- **Negative:** No cross-VM mission migration — if a VM is overloaded, missions cannot be moved to another VM mid-flight. Sites are bound to their VM.
- **Negative:** Build queue is per-VM — a burst of build requests on one VM does not offload to idle VMs. Capacity planning is per-VM.
- **Negative:** Single process failure takes down all sites on that VM. Mitigation: process manager (systemd, pm2) for auto-restart.
- **Technical debt:** Docker containerization for Tier 2 (programmer surface) is knowingly postponed. When Tier 2 is needed, the deployment model must be extended — not replaced — to add containerized mission execution alongside the existing non-containerized Tier 1 flow.

## Evolution

- **Tier 2 programmer surface** — when site owner editing expands to include arbitrary code execution (custom components, scripts, stylesheets), Docker containerization becomes necessary. This ADR is extended, not superseded — Tier 1 remains non-containerized.
- **Cross-VM load balancing** — if per-VM capacity planning proves insufficient at scale (e.g. >500 sites per VM), a thin routing layer may be added to distribute new missions across VMs. This does not require a message broker — a simple HTTP endpoint that redirects to the correct VM suffices.
- **Build queue saturation** — if build queue wait times exceed acceptable thresholds (e.g. >5 minutes), consider splitting builds across VMs or adding dedicated build VMs. Monitor queue depth and wait time per VM.
