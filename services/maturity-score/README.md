# maturity-score

ADR-0042: Maturity Score Worker — a request-triggered Cloudflare Worker that accepts `POST /score` with `{ url: string }` and returns `{ score: number }`.

## Status

**Stub implementation.** The Worker returns a deterministic pseudo-random score (0–100) derived from the URL hash. The real HDRI scoring methodology is maintained outside the codebase and will replace the stub without changing the endpoint contract.

## Endpoint

```
POST /score
Content-Type: application/json

{ "url": "https://example.com" }
```

Response:

```
{ "score": 42 }
```

## Development

```sh
npx wrangler dev
```

## Deploy

```sh
npx wrangler deploy
```

## Environment

The stub implementation does not consume environment variables. When the real HDRI scoring logic is added, declare secrets in `wrangler.jsonc` and create a `.env.example` per DNA-40.

## References

- [ADR-0042](../docs/adrs/adr-0042-add-maturity-score-worker-as-new-cloudflare-worker-service.md) — decision record
- [RFC-0802](../docs/rfcs/rfc-0802-add-interactive-maturity-mountain-page-with-gsap-camera-pan-and-marker-animation.md) — frontend consumer (mountain-journey section)
