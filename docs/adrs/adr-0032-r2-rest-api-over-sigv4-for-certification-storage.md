---
id: ADR-0032
title: "Use Cloudflare R2 REST API with Bearer token instead of S3 SigV4 for certification durable storage"
status: implemented
scope: package
decider: architecture
createdAt: 2026-08-16
updatedAt: 2026-08-16
implementedAt: 2026-08-16
supersedes: []
supersededBy:
related:
  - RFC-0865
reviewers:
  - human:andrii-syrokomskyi
---

# ADR-0032: Use Cloudflare R2 REST API with Bearer token instead of S3 SigV4 for certification durable storage

## Context

The R2 durable storage adapter (`packages/werkstatt/src/certification/storage/r2-adapter.ts`) was originally implemented using the S3-compatible API with AWS Signature V4 signing, as specified in RFC-0865. The module contract explicitly required "fetch() with inline Sig V4 signing" and forbade @aws-sdk/* dependencies.

During the first real pipeline run (warpgogol-com r000029, Aug 2026), the SigV4 implementation produced persistent `SignatureDoesNotMatch` errors from R2. Multiple fix attempts failed:

- URI encoding of hyphens in bucket names (`%2D` instead of `-`)
- `Content-Length` header mismatch between signed and actual value sent by `fetch()`
- Canonical URI path encoding (S3 expects raw pathname, not URI-encoded)
- `x-amz-content-sha256` header value consistency

Each attempt required a full `leitstand.certify` cycle (~4 min) to test, making iteration slow. The root cause was never fully identified — the SigV4 canonical request hash never matched what R2 computed server-side.

## Decision

The R2 storage adapter uses the Cloudflare R2 REST API (`https://api.cloudflare.com/client/v4/accounts/{accountId}/r2/buckets/{bucket}/objects/{key}`) with `Authorization: Bearer {apiToken}` instead of S3 SigV4 signing.

- The `R2StorageConfig` interface retains `accessKeyId` and `secretAccessKey` for backward compatibility, but authentication uses `apiToken` via Bearer header.
- `headObject` uses `GET` with `Range: bytes=0-0` because the R2 REST API does not support `HEAD` requests (returns HTTP 405).
- The module contract is updated: "fetch() with Bearer token" replaces "fetch() with inline Sig V4 signing".

## Justification

- **Simplicity**: Bearer token auth is a single header — no canonical request construction, no HMAC chain, no timestamp formatting. SigV4 requires 6+ helper functions and careful URI/header encoding.
- **Reliability**: The R2 REST API is Cloudflare's native API, not a compatibility layer. SigV4 is an AWS protocol that R2 implements as a best-effort compatibility surface.
- **Operational**: The API token is the same type of credential already used for `CLOUDFLARE_API_TOKEN`. No separate S3-compatible credential creation flow needed.
- **Module contract alignment**: The "no external SDK" constraint is preserved — both approaches use `fetch()` only.

## Consequences

- **Positive**: Eliminates an entire class of signing bugs. The adapter is ~120 lines shorter. Future agents will not encounter `SignatureDoesNotMatch` errors.
- **Positive**: `headObject` via `Range: bytes=0-0` returns `content-range` header with total size, providing the same metadata as S3 HEAD.
- **Negative**: The R2 REST API has different rate limits than the S3-compatible API. For high-volume audit record appends, this may require batching.
- **Negative**: `accessKeyId` and `secretAccessKey` in `R2StorageConfig` are now unused for authentication but retained for interface stability. They may be removed in a future breaking change.
- **Technical debt**: Other R2 adapters (axiom-evidence, nachweis) still use S3 SigV4. This ADR applies only to the certification storage adapter. Migrating those is a separate decision.

## Evolution

If Cloudflare introduces breaking changes to the R2 REST API (e.g., deprecating the objects endpoint), the adapter will need to switch back to S3 SigV4 or use the Workers R2 binding API. The `R2StorageConfig` interface is designed to support either auth method without breaking consumers.

Implemented in commit `4a431af2` (platform 13.7.9, Aug 2026).
