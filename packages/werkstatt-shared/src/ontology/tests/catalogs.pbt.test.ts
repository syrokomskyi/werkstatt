import { test, expect } from "vitest";
import fc from "fast-check";
import { StarCatalog, starNameSchema } from "../cosmic/star-catalog.ts";
import { PlanetCatalog, planetNameSchema } from "../cosmic/planet-catalog.ts";
import { MoonCatalog, moonNameSchema } from "../cosmic/moon-catalog.ts";
import { cosmicNameSchema } from "../cosmic/index.ts";
import {
  LayerValues,
  layerSchema,
  ComponentRoleValues,
  componentRoleSchema,
  IndustryValues,
  industrySchema,
} from "../enums.ts";

test("PBT: any star from the catalog passes starNameSchema", () => {
  fc.assert(
    fc.property(fc.constantFrom(...StarCatalog), (star) => {
      expect(starNameSchema.safeParse(star).success).toBe(true);
    }),
  );
});

test("PBT: any planet from the catalog passes planetNameSchema", () => {
  fc.assert(
    fc.property(fc.constantFrom(...PlanetCatalog), (planet) => {
      expect(planetNameSchema.safeParse(planet).success).toBe(true);
    }),
  );
});

test("PBT: any moon from the catalog passes moonNameSchema", () => {
  fc.assert(
    fc.property(fc.constantFrom(...MoonCatalog), (moon) => {
      expect(moonNameSchema.safeParse(moon).success).toBe(true);
    }),
  );
});

test("PBT: any cosmic name passes cosmicNameSchema", () => {
  const allCosmic = [...StarCatalog, ...PlanetCatalog, ...MoonCatalog];
  fc.assert(
    fc.property(fc.constantFrom(...allCosmic), (name) => {
      expect(cosmicNameSchema.safeParse(name).success).toBe(true);
    }),
  );
});

test("PBT: any Layer value passes layerSchema", () => {
  fc.assert(
    fc.property(fc.constantFrom(...LayerValues), (v) => {
      expect(layerSchema.safeParse(v).success).toBe(true);
    }),
  );
});

test("PBT: any ComponentRole value passes componentRoleSchema", () => {
  fc.assert(
    fc.property(fc.constantFrom(...ComponentRoleValues), (v) => {
      expect(componentRoleSchema.safeParse(v).success).toBe(true);
    }),
  );
});

test("PBT: any Industry value passes industrySchema", () => {
  fc.assert(
    fc.property(fc.constantFrom(...IndustryValues), (v) => {
      expect(industrySchema.safeParse(v).success).toBe(true);
    }),
  );
});

test("PBT: random non-cosmic strings fail cosmicNameSchema", () => {
  fc.assert(
    fc.property(
      fc
        .string({ minLength: 1 })
        .filter(
          (s) =>
            !StarCatalog.includes(s as never) &&
            !PlanetCatalog.includes(s as never) &&
            !MoonCatalog.includes(s as never),
        ),
      (s) => {
        expect(cosmicNameSchema.safeParse(s).success).toBe(false);
      },
    ),
  );
});
