# External primary-source notes

These notes exist so the repository agent can re-verify volatile provider/tool assumptions before accepting the RFCs.

The architectural baseline itself comes from `sources/current/*`.

## Google Lighthouse

### Performance score variability

Primary source:

`https://developer.chrome.com/docs/lighthouse/performance/performance-scoring`

Relevant fact: Lighthouse documents that performance score/metric values can fluctuate because of underlying conditions and recommends thinking in terms of a distribution rather than treating one score as absolute truth.

Design consequence:

- canonical methodology uses multiple sequential runs;
- no "best run" selection;
- samples + median disclosed.

### Lighthouse Result Object

Primary source:

`https://github.com/GoogleChrome/lighthouse/blob/main/docs/understanding-results.md`

Relevant LHR metadata includes, among other fields:

- `lighthouseVersion`
- `fetchTime`
- `userAgent`
- `requestedUrl`
- final/main document URL
- result/audit/category data

Design consequence:

- JSON LHR is canonical evidence;
- capture tool/runtime metadata from provider output rather than screenshot-only evidence.

### Agentic Browsing

Primary source:

`https://developer.chrome.com/docs/lighthouse/agentic-browsing/scoring`

As of 2026-08-18, Chrome documentation describes Agentic Browsing as experimental and not a conventional weighted 0–100 category.

Design consequence:

- preserve pass/status/count semantics;
- do not turn `3/3` into a fake `100`.

Re-verify this at implementation because the feature is explicitly evolving.

## Cloudflare Agent Readiness

### Product/method

Primary source:

`https://blog.cloudflare.com/agent-readiness/`

Cloudflare introduced `isitagentready.com` and explains that it makes requests to the submitted site and scores Agent Readiness dimensions.

The same checks are integrated into URL Scanner and are available programmatically by requesting Agent Readiness in a scan.

### URL Scanner API

Primary source:

`https://developers.cloudflare.com/radar/investigate/url-scanner/`

Relevant current behavior:

- URL Scanner supports API submissions.
- It requires a URL Scanner-specific API token.
- default scan visibility is Public.
- `visibility: "Unlisted"` keeps the scan out of recent/search listings.
- completed successful scans have a retention policy documented by Cloudflare.
- result retrieval is asynchronous.
- Cloudflare recommends polling at a bounded interval (currently documented as 10–30 seconds).

Design consequence:

- use API, not UI scraping;
- explicitly request Unlisted;
- dedicated credentials;
- 15-second bounded polling.

### Schema evolution

Primary source:

`https://developers.cloudflare.com/changelog/product-group/analytics/`

Cloudflare's 2026 changelog describes Agent Readiness presentation with a number of specialized scores that may differ from the initial launch presentation.

Design consequence:

- do not hard-code "four dimensions forever";
- preserve raw response;
- fixture/version parser;
- schema drift fails safely.

## eIDAS / timestamp terminology

Primary law:

`https://eur-lex.europa.eu/eli/reg/2014/910/oj/eng`

Consolidated text:

`https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:02014R0910-20241018`

Relevant semantic point: "qualified electronic time stamp" is a defined legal term tied to the eIDAS requirements for qualified electronic time stamps. It is not a synonym for any RFC 3161 token.

Design consequence:

- `RFC 3161-Zeitstempel` is the default public phrase;
- `eIDAS-qualified` is a separate assurance claim requiring evidence.

## Provider/trademark caveat

The package intentionally uses text provider attribution rather than provider logos. If logos are desired later, check the current Google/Cloudflare trademark usage rules at that time and implement them as presentation assets only. Logo presence must never be used as proof of certification/endorsement.
