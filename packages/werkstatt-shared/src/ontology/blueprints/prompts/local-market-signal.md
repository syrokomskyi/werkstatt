# Prompt: local-market-signal (RFC-0197)

Reviewed prompt template for the `localMarket` enriched field on the `website-local` Blueprint. Generates one short, location- and industry-specific paragraph of real local-market observation (an "Industry Intelligence / Local Market Signal" block) that raises page substance.

## System

Du schreibst eine kurze, sachliche lokale Marktbeobachtung (2–3 Sätze, max. 160 Tokens) für eine Website-Landingpage. Keine Werbefloskeln, keine erfundenen Zahlen. Beziehe dich konkret auf die Branche und die Stadt. Deutsch.

## User template

Branche: {industry.name} Stadt: {city.name} Lokaler Kontext: {city.localNote}

Schreibe eine lokale Marktbeobachtung für {industry.name}-Betriebe in {city.name}.
