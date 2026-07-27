# Cosmic Names — packages/ui

Assigned cosmicName values for all UI atoms in `packages/ui/`. Generated reference — source of truth is each `*.manifest.yaml`. Validated at deploy time by `cosmic.catalog.validate` and `cosmic.name.unique`.

## Sections — PlanetCatalog entries

| semanticId   | cosmicName | Rationale                                                  |
| ------------ | ---------- | ---------------------------------------------------------- |
| hero         | Europa     | Icy, vast, full of potential — the first impression        |
| dna          | Io         | Volcanic, intensely active — the brand's living core       |
| problem      | Callisto   | Ancient, scarred — carries the weight of the problem       |
| approach     | Titan      | Dense atmosphere, complex — a world of method and depth    |
| impact       | Ganymede   | Largest moon — the biggest of outcomes                     |
| social-proof | Enceladus  | Bright, reflective, trust-radiating                        |
| people       | Mimas      | Small but present — the human faces (RFC-0200)             |
| final-cta    | Dione      | Companion to Rhea — close pair with donation-use           |
| donation-use | Rhea       | Large, dependable — where resources land                   |
| transparency | Tethys     | Clear, icy surface — open governance                       |
| women        | Iapetus    | Two-toned, distinct — highlighting differentiated identity |
| markdown     | Hyperion   | Irregular, chaotic shape — freeform content                |
| navigation   | Phoebe     | Retrograde orbit, catches all — site-wide wayfinding       |

## Components — MoonCatalog entries

| semanticId      | cosmicName | Rationale                                                    |
| --------------- | ---------- | ------------------------------------------------------------ |
| header          | Oberon     | Distant but authoritative — the outermost guard              |
| footer          | Titania    | Largest Uranus moon — substantial, closing weight            |
| breadcrumbs     | Ariel      | Bright, guides the way — orientation aid                     |
| lang-switcher   | Umbriel    | Dark moon, subtle — quiet but essential                      |
| person-profile  | Miranda    | Dramatic topography — individual human depth                 |
| brand-label     | Proteus    | Shape-shifting — adapts to context while retaining identity  |
| footer-promo    | Nereid     | Eccentric orbit — the unexpected secondary ask               |
| copyright       | Charon     | Faithful companion to Pluto — always alongside the main body |
| structured-data | Triton     | Retrograde, captured — injected against the normal flow      |
| background      | Atlas      | Titan bearing the heavens — foundational, supports all above |
| donation-card   | Galatea    | Bright, icy surface — clear and trustworthy display          |

## Passport-reserved MoonCatalog entries

These names exist in MoonCatalog but are reserved for Cosmic Passport assignment (RFC-0028, DNA-31). Do not assign them to component manifests.

| cosmicName | Parent planet | Reserved for         |
| ---------- | ------------- | -------------------- |
| Methone    | Saturn        | Passport moon slot A |
| Bianca     | Uranus        | Passport moon slot B |
| Klarissa   | Neptune       | Passport moon slot C |
| Adrastea   | Jupiter       | Passport moon slot D |
| Despina    | Neptune       | Passport moon slot E |
