/*
<MODULE_CONTRACT>
<purpose>
Closed catalog of IAU-approved moon names for the Uni UI Ontology cosmic overlay.
Each entry is a valid cosmicName for manifests with layer="component"
(DNA-23, RFC-0025). "Moon" in this context denotes the component archetype —
bodies that orbit planets (sections) just as components orbit sections.

Catalog scope: all named moons of Uranus, Neptune, and the Pluto system;
plus all irregular/distant moons of Jupiter and Saturn.
The inner/classical Jupiter and Saturn moons are in PlanetCatalog (section archetypes).
</purpose>
<non-goals>
  <item>Do not add entries that are not IAU-approved names.</item>
  <item>Do not extend this catalog without a superseding RFC (DNA-19).</item>
  <item>Do not import business or app logic.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Wave 1 (RFC-0025): Initial creation — Uranus/Neptune/Pluto + irregular moon catalog for component-layer cosmicName.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";

// [DNA-23][DNA-19] Closed catalog — extension requires a superseding RFC.
// Sources: IAU Working Group on Planetary System Nomenclature (WGPSN).
// Scope: classical + irregular moons of Uranus, Neptune, and the Pluto system;
//         irregular moons of Jupiter and Saturn.
// NOTE: Methone, Bianca, Klarissa, Adrastea, Despina are present in this catalog
//       but are RESERVED for Cosmic Passport assignment (RFC-0028, DNA-31).
//       Do not assign them to component manifests; use the remaining entries instead.
// Sorted alphabetically; order has no semantic significance.
export const MoonCatalog = [
  // ── Uranus — classical (inner) moons ─────────────────────────────────────
  "Ariel",
  "Belinda",
  "Bianca", // ← PASSPORT-RESERVED — do not assign to component manifests
  "Cordelia",
  "Cressida",
  "Cupid",
  "Desdemona",
  "Juliet",
  "Mab",
  "Miranda",
  "Oberon",
  "Ophelia",
  "Portia",
  "Puck",
  "Rosalind",
  "Titania",
  "Umbriel",

  // ── Uranus — irregular moons ──────────────────────────────────────────────
  "Caliban",
  "Ferdinand",
  "Francesca",
  "Margaret",
  "Perdita",
  "Prospero",
  "Setebos",
  "Stephano",
  "Sycorax",
  "Trinculo",

  // ── Neptune — inner and classical moons ───────────────────────────────────
  "Despina", // ← PASSPORT-RESERVED — do not assign to component manifests
  "Galatea",
  "Klarissa", // ← PASSPORT-RESERVED — do not assign to component manifests
  "Naiad",
  "Nereid",
  "Proteus",
  "Thalassa",
  "Triton",

  // ── Neptune — irregular moons ─────────────────────────────────────────────
  "Halimede",
  "Laomedeia",
  "Neso",
  "Psamathe",
  "Sao",

  // ── Pluto system ──────────────────────────────────────────────────────────
  "Charon",
  "Hydra",
  "Kerberos",
  "Nix",
  "Styx",

  // ── Jupiter — irregular moons ─────────────────────────────────────────────
  "Adrastea", // ← PASSPORT-RESERVED — do not assign to component manifests
  "Aitne",
  "Ananke",
  "Aoede",
  "Arche",
  "Autonoe",
  "Callirrhoe",
  "Carme",
  "Carpo",
  "Chaldene",
  "Eirene",
  "Ersa",
  "Eupheme",
  "Euanthe",
  "Euporie",
  "Eurydome",
  "Hegemone",
  "Helike",
  "Herse",
  "Hermippe",
  "Iocaste",
  "Isonoe",
  "Kale",
  "Kallichore",
  "Kalyke",
  "Leda",
  "Lysithea",
  "Megaclite",
  "Mneme",
  "Orthosie",
  "Pandia",
  "Pasiphae",
  "Pasithee",
  "Philophrosyne",
  "Praxidike",
  "Sinope",
  "Sponde",
  "Taygete",
  "Thelxinoe",
  "Themisto",
  "Thyone",

  // ── Saturn — irregular moons ──────────────────────────────────────────────
  "Aegaeon",
  "Aegir",
  "Albiorix",
  "Anthe",
  "Bebhionn",
  "Bergelmir",
  "Bestla",
  "Daphnis",
  "Erriapo",
  "Farbauti",
  "Fenrir",
  "Fornjot",
  "Greip",
  "Hati",
  "Hyrrokkin",
  "Ijiraq",
  "Jarnsaxa",
  "Kari",
  "Kiviuq",
  "Loge",
  "Methone", // ← PASSPORT-RESERVED — do not assign to component manifests
  "Mundilfari",
  "Narvi",
  "Paaliaq",
  "Pallene",
  "Polydeuces",
  "Siarnaq",
  "Skathi",
  "Skoll",
  "Surtur",
  "Suttungr",
  "Tarvos",
  "Tarqeq",
  "Thrymr",
  "Ymir",
] as const;

export type MoonName = (typeof MoonCatalog)[number];

export const moonNameSchema = z.enum(MoonCatalog);
