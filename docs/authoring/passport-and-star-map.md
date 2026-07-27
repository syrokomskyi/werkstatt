# Authoring: Cosmic Passport & Star Map

> RFC-0028 / DNA-31..34

---

## Overview

The Cosmic Passport is a publicly-accessible page that displays build provenance, quality metrics (Nebula Score), and an architecture diagram (Star Map) for each app in the warpgogol monorepo. It is generated automatically during the CI/CD release pipeline and requires no manual authoring — only configuration.

---

## Pages

Two routes are registered per app:

| Route              | Purpose                                                   |
| ------------------ | --------------------------------------------------------- |
| `/cosmic/passport` | Full passport: header, Nebula Score, provenance, Star Map |
| `/cosmic/star-map` | Standalone Star Map for architecture exploration          |

Both pages are declared as content files under `src/content/pages/`:

```
apps/<app>/src/content/pages/de/cosmic/passport.md
apps/<app>/src/content/pages/en/cosmic/passport.md
apps/<app>/src/content/pages/de/cosmic/star-map.md
apps/<app>/src/content/pages/en/cosmic/star-map.md
```

---

## Block composition

The passport pages use the following moon quintet via `use:` declarations:

| `use:` value | Moon               | Role                       |
| ------------ | ------------------ | -------------------------- |
| `Methone`    | PassportHeader     | Title + badge              |
| `Despina`    | Pulsar             | Build freshness indicator  |
| `Klarissa`   | PassportScoreGrid  | Nebula Score breakdown     |
| `Bianca`     | PassportProvenance | Commit, timestamp, builder |
| `Adrastea`   | PassportStarMap    | Embedded star map SVG      |

All five moons are data-driven: they read `cosmic-passport.json` at SSG build time via `@warpgogol/passport/data`. No props need to be set for data display — only layout or display options are exposed as props.

---

## Enabling the passport for an app

Add a `release.passport` block to the app's `system.md`:

```yaml
release:
  passport:
    enabled: true         # default: true
    indexable: true       # allow search engine indexing; default: true
    keyVersion: v1        # matches the key in cosmic-passport-key.json
    heartbeatUrl: https://example.com/.well-known/cosmic-passport.json
```

Then register the `/cosmic/passport` and `/cosmic/star-map` routes in the `pages:` list:

```yaml
pages:
  - route: /cosmic/passport
    cosmicStar: Polaris
    planets:
      - { cosmicPlanet: Methone,  pin: "1.0.0" }
      - { cosmicPlanet: Despina,  pin: "1.0.0" }
      - { cosmicPlanet: Klarissa,  pin: "1.0.0" }
      - { cosmicPlanet: Bianca,   pin: "1.0.0" }
      - { cosmicPlanet: Adrastea, pin: "1.0.0" }

  - route: /cosmic/star-map
    cosmicStar: Polaris
    planets:
      - { cosmicPlanet: Methone,  pin: "1.0.0" }
      - { cosmicPlanet: Adrastea, pin: "1.0.0" }
```

---

## Showing the Verifiable Credential proof

The `PassportProvenance` (Bianca) moon hides the full VC by default. To show the expandable VC details panel, pass `showVC: true` in the block props:

```yaml
  - id: passport-provenance
    use: Bianca
    props:
      showVC: true
```

Only enable this on internal or development builds — the full VC JSON is verbose and unreadable to most visitors.

---

## Nebula Score thresholds

| Score  | Grade     | Bar colour |
| ------ | --------- | ---------- |
| 90–100 | Excellent | Green      |
| 75–89  | Good      | Lime       |
| 60–74  | Fair      | Amber      |
| 0–59   | Poor      | Red        |

Scores are weighted composites of four pillars — see `docs/engineering/passport-signing-and-keys.md` for pillar definitions.

---

## Public key rotation

The passport is signed with an Ed25519 key stored in `public/.well-known/cosmic-passport-key.json`. To rotate:

```
pnpm kernel passport.key.rotate --appDir apps/<app>
```

This prints the new private key to stdout **once** — save it immediately as the `PASSPORT_PRIVATE_KEY` GitHub Actions secret. The public key file is updated automatically.

The old key is retained in the file with `"active": false` so old passports can still be verified during a transition window.

---

## Growth events emitted

| Event               | Emitted by                 | When                                  |
| ------------------- | -------------------------- | ------------------------------------- |
| `passport-view`     | Methone (PassportHeader)   | On every `/cosmic/passport` page load |
| `star-map-navigate` | Adrastea (PassportStarMap) | On star map page or inline expand     |

Both events are part of the closed EventName catalog (DNA-27).
