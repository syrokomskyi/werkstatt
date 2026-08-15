# Agent runtime certification program

This directory is the machine-governed, strictly sequential execution plan for RFC-0855. The authoritative order and draft state live in `program.yaml`; each packet is self-contained for a fresh executor with no conversation history.

## Operating law

- Execute exactly one packet at a time on `program/agent-runtime-certification-cutover`.
- A draft authorizes no mutation. RFC-0856 preparation and sealing resolve the decision, predecessor completion commit, source hashes, branch, and independent Steward/Executor identities.
- The Executor changes only `allowedFiles`, leaves only enumerated transition diagnostics, and cannot seal, complete, or recover its own packet.
- Missing or stale facts fail closed. There is no force, bypass, warning-only, compatibility, auto-takeover, or parallel path.
- Packet 000 is the sole bootstrap. Packets 010–240 bind `baseCommit` to the predecessor completion commit.
- CERT-002 through CERT-010 stay qualified spec decisions until just-in-time preparation materializes and obtains explicit human acceptance of their RFCs.
- AMD-007 stays qualified; packet 040 owns explicit acceptance and never edits immutable snapshot files.

## Three committed boundaries

The Steward commits the seal. The Executor makes canonical implementation commits. A different Steward verifies and commits completion evidence plus program state. Runtime lease tokens remain untracked under `.forge/program-leases/` and never enter reports.

## Fixture validation

Until packet 000 installs `program.packet.validate`, run this structural validator from the repository root:

```sh
pnpm exec tsx -e 'import fs from "node:fs"; import path from "node:path"; import YAML from "yaml"; const d="docs/plans/agent-runtime-certification"; const p=YAML.parse(fs.readFileSync(path.join(d,"program.yaml"),"utf8")); if(p.schema!=="forge/program@1"||p.parallelism!==1||p.packets.length!==25) throw new Error("program"); for(const x of p.packets){const t=fs.readFileSync(path.join(d,x.file),"utf8"); const m=t.match(/^---\\n([\\s\\S]*?)\\n---/); if(!m) throw new Error(x.file); const y=YAML.parse(m[1]); if(y.schema!=="forge/program-packet@1"||y.state!=="draft"||y.baseCommit!==null||y.packetId!==x.packetId) throw new Error(x.file); const hs=[...t.matchAll(/^## (.+)$/gm)]; if(hs.length!==10) throw new Error(x.file+":sections"); }'
```

The validator must exit zero before RFC-0855 is stamped. Packet 000 replaces it with strict schemas, git boundaries, leases, completion, and recovery.

## Artifact map

- `packet-template.md`: mandatory ten-section order.
- `NNN-*.md`: draft execution packets.
- `preparations/`, `completions/`, and `recoveries/`: record field-order templates and later evidence.
