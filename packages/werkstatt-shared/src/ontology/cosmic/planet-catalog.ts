/*
<MODULE_CONTRACT>
<purpose>
Closed catalog of IAU-approved moon and dwarf-planet names for the Uni UI Ontology
cosmic overlay. Each entry is a valid cosmicName for manifests with layer="section"
(DNA-23, RFC-0025). "Planet" in this context denotes the section archetype — bodies
that orbit a star (page) just as sections orbit a page.

Catalog scope: inner/classical moons of Jupiter and Saturn, Mars moons,
and IAU-recognized dwarf planets. The outer-system moons (Uranus, Neptune, Pluto)
are in MoonCatalog (component archetypes).
</purpose>
<non-goals>
  <item>Do not add entries that are not IAU-approved names.</item>
  <item>Do not extend this catalog without a superseding RFC (DNA-19).</item>
  <item>Do not import business or app logic.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Wave 1 (RFC-0025): Initial creation — Jupiter/Saturn/Mars/dwarf-planet catalog for section-layer cosmicName.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";

// [DNA-23][DNA-19] Closed catalog — extension requires a superseding RFC.
// Sources: IAU Working Group on Planetary System Nomenclature (WGPSN).
// Scope: classical/inner moons of Jupiter and Saturn; Mars moons; IAU dwarf planets.
// Outer-system moons (Uranus, Neptune, Pluto system) live in MoonCatalog.
// Sorted alphabetically; order has no semantic significance.
export const PlanetCatalog = [
  // ── Dwarf planets (IAU-recognized) ────────────────────────────────────────
  "Ceres",
  "Eris",
  "Gonggong",
  "Haumea",
  "Ixion",
  "Makemake",
  "Orcus",
  "Quaoar",
  "Sedna",
  "Varuna",

  // ── Mars system ───────────────────────────────────────────────────────────
  "Deimos",
  "Phobos",

  // ── Jupiter — inner & Galilean moons ──────────────────────────────────────
  "Amalthea",
  "Callisto",
  "Elara",
  "Europa",
  "Ganymede",
  "Himalia",
  "Io",
  "Metis",
  "Thebe",

  // ── Saturn — inner, co-orbital, and classical moons ───────────────────────
  "Atlas",
  "Calypso",
  "Dione",
  "Enceladus",
  "Epimetheus",
  "Helene",
  "Hyperion",
  "Iapetus",
  "Janus",
  "Mimas",
  "Pan",
  "Pandora",
  "Phoebe",
  "Prometheus",
  "Rhea",
  "Telesto",
  "Tethys",
  "Titan",
] as const;

export type PlanetName = (typeof PlanetCatalog)[number];

export const planetNameSchema = z.enum(PlanetCatalog);
