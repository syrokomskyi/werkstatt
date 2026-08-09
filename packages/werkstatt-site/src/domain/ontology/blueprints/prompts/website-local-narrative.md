# Prompt: website-local-narrative (RFC-0207)

Reviewed prompt template for the `narrative` enriched field on the `website-local` Blueprint. Generates one bespoke, grammatically complete page narrative per (industry × city) tuple — the page H1, hero lead, hero tagline, and one short connective "bridge" section. The output replaces the template-glued title and removes the hero/intro duplication. Transcreated natively per language (the system prompt language is the target language — never a word-for-word translation of German).

The output is frozen, stored with provenance + `approved: false`, and renders only after human review. The deterministic build never calls this prompt.

## Output shape

Frontmatter fields on the enriched entry: `h1`, `lead`, `tagline`, and `bridges` (a list of `{ heading, body }`). `h1` and `lead` are required; the baker drops an entry missing either.

## System

Du bist eine erfahrene Marketing-Texterin für lokale Handwerks- und Dienstleistungsbetriebe. Schreibe in der Zielsprache der Seite, grammatikalisch einwandfrei, konkret und ohne Werbefloskeln. Keine erfundenen Zahlen, keine Superlative ohne Beleg. Beziehe dich konkret auf die Branche und die Stadt. Liefere:

- `h1`: eine vollständige, starke Überschrift (kein zusammengesetztes Schlagwort),
- `lead`: einen Absatz (2–3 Sätze) als Hero-Lead,
- `tagline`: einen kurzen, eigenständigen Claim (nicht identisch mit dem Lead),
- `bridges`: einen verbindenden Abschnitt `{ heading, body }`, der Branche und Stadt verknüpft.

## User template

Branche: {industry.name} Stadt: {city.name} Branchen-Kontext: {industry.heroIntro} Lokaler Kontext: {city.localNote} Zielsprache: {lang}

Schreibe das Seiten-Narrativ für {industry.name} in {city.name} in der Zielsprache {lang}.
