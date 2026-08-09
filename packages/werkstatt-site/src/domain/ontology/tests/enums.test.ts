import { test, expect, describe } from "vitest";
import {
  LayerValues,
  layerSchema,
  ComponentRoleValues,
  componentRoleSchema,
  IndustryValues,
  industrySchema,
  IndustryLabels,
} from "../enums.ts";
import { StarCatalog, starNameSchema } from "../cosmic/star-catalog.ts";
import { PlanetCatalog, planetNameSchema } from "../cosmic/planet-catalog.ts";
import { MoonCatalog, moonNameSchema } from "../cosmic/moon-catalog.ts";
import { cosmicNameSchema } from "../cosmic/index.ts";

describe("Layer enum", () => {
  test("has exactly 3 values", () => {
    expect(LayerValues).toHaveLength(3);
  });

  test("contains page, section, component", () => {
    expect([...LayerValues].sort()).toEqual(["component", "page", "section"]);
  });

  test("schema accepts valid values", () => {
    expect(layerSchema.safeParse("page").success).toBe(true);
    expect(layerSchema.safeParse("section").success).toBe(true);
    expect(layerSchema.safeParse("component").success).toBe(true);
  });

  test("schema rejects invalid values", () => {
    expect(layerSchema.safeParse("layout").success).toBe(false);
    expect(layerSchema.safeParse("").success).toBe(false);
  });
});

describe("ComponentRole enum", () => {
  test("contains section framework primitives", () => {
    expect(ComponentRoleValues).toContain("section-shell");
    expect(ComponentRoleValues).toContain("section-header");
    expect(ComponentRoleValues).toContain("section-body");
    expect(ComponentRoleValues).toContain("section-cta");
    expect(ComponentRoleValues).toContain("section-image");
    expect(ComponentRoleValues).toContain("site-background");
  });

  test("schema accepts valid values", () => {
    expect(componentRoleSchema.safeParse("header").success).toBe(true);
    expect(componentRoleSchema.safeParse("section-shell").success).toBe(true);
  });

  test("schema rejects invalid values", () => {
    expect(componentRoleSchema.safeParse("unknown-role").success).toBe(false);
  });

  test("has no duplicate values", () => {
    const seen = new Set<string>();
    for (const v of ComponentRoleValues) {
      expect(seen.has(v)).toBe(false);
      seen.add(v);
    }
  });
});

describe("Industry enum", () => {
  test("has exactly 6 values", () => {
    expect(IndustryValues).toHaveLength(6);
  });

  test("schema accepts valid values", () => {
    expect(industrySchema.safeParse("trades-and-construction").success).toBe(true);
    expect(industrySchema.safeParse("non-profit").success).toBe(true);
  });

  test("schema rejects invalid values", () => {
    expect(industrySchema.safeParse("technology").success).toBe(false);
  });

  test("IndustryLabels covers all Industry values", () => {
    for (const v of IndustryValues) {
      expect(IndustryLabels[v]).toBeDefined();
      expect(IndustryLabels[v].length).toBeGreaterThan(0);
    }
  });
});

describe("StarCatalog", () => {
  test("is non-empty", () => {
    expect(StarCatalog.length).toBeGreaterThan(100);
  });

  test("contains known stars", () => {
    expect(StarCatalog).toContain("Vega");
    expect(StarCatalog).toContain("Sirius");
    expect(StarCatalog).toContain("Polaris");
  });

  test("has no duplicate entries", () => {
    const seen = new Set<string>();
    for (const s of StarCatalog) {
      expect(seen.has(s)).toBe(false);
      seen.add(s);
    }
  });

  test("schema accepts valid star names", () => {
    expect(starNameSchema.safeParse("Vega").success).toBe(true);
  });

  test("schema rejects invalid star names", () => {
    expect(starNameSchema.safeParse("NotAStar").success).toBe(false);
  });
});

describe("PlanetCatalog", () => {
  test("contains known planets", () => {
    expect(PlanetCatalog).toContain("Europa");
    expect(PlanetCatalog).toContain("Io");
    expect(PlanetCatalog).toContain("Titan");
    expect(PlanetCatalog).toContain("Ceres");
  });

  test("has no duplicate entries", () => {
    const seen = new Set<string>();
    for (const p of PlanetCatalog) {
      expect(seen.has(p)).toBe(false);
      seen.add(p);
    }
  });

  test("schema accepts valid planet names", () => {
    expect(planetNameSchema.safeParse("Europa").success).toBe(true);
  });

  test("schema rejects invalid planet names", () => {
    expect(planetNameSchema.safeParse("Earth").success).toBe(false);
  });
});

describe("MoonCatalog", () => {
  test("contains known moons", () => {
    expect(MoonCatalog).toContain("Oberon");
    expect(MoonCatalog).toContain("Triton");
    expect(MoonCatalog).toContain("Charon");
  });

  test("contains passport-reserved moons", () => {
    const reserved = ["Methone", "Despina", "Klarissa", "Bianca", "Adrastea"];
    for (const r of reserved) {
      expect(MoonCatalog).toContain(r);
    }
  });

  test("has no duplicate entries", () => {
    const seen = new Set<string>();
    for (const m of MoonCatalog) {
      expect(seen.has(m)).toBe(false);
      seen.add(m);
    }
  });

  test("schema accepts valid moon names", () => {
    expect(moonNameSchema.safeParse("Oberon").success).toBe(true);
  });

  test("schema rejects invalid moon names", () => {
    expect(moonNameSchema.safeParse("Luna").success).toBe(false);
  });
});

describe("Cross-catalog identity", () => {
  test("Planet and Moon catalogs are mutually disjoint", () => {
    const planetSet = new Set<string>(PlanetCatalog);
    for (const m of MoonCatalog) {
      expect(planetSet.has(m)).toBe(false);
    }
  });

  test("Star and Moon catalogs are mutually disjoint", () => {
    const starSet = new Set<string>(StarCatalog);
    for (const m of MoonCatalog) {
      expect(starSet.has(m)).toBe(false);
    }
  });
});

describe("cosmicNameSchema", () => {
  test("accepts star names", () => {
    expect(cosmicNameSchema.safeParse("Vega").success).toBe(true);
  });

  test("accepts planet names", () => {
    expect(cosmicNameSchema.safeParse("Europa").success).toBe(true);
  });

  test("accepts moon names", () => {
    expect(cosmicNameSchema.safeParse("Oberon").success).toBe(true);
  });

  test("rejects non-cosmic strings", () => {
    expect(cosmicNameSchema.safeParse("NotInAnyCatalog").success).toBe(false);
  });
});
