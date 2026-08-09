import { test, expect, describe } from "vitest";
import { createGeoService } from "../service.ts";
import { getCountry } from "../countries.ts";
import { getRegion } from "../regions.ts";
import { buildCityCatalog } from "../cities.ts";
import { citySlug } from "../slug.ts";

describe("getCountry", () => {
  test("resolves DE with localized names", () => {
    const c = getCountry("DE", ["de", "uk"]);
    expect(c).toBeTruthy();
    expect(c!.alpha2).toBe("DE");
    expect(c!.names.de).toBeTruthy();
    expect(c!.names.uk).toBeTruthy();
  });

  test("returns undefined for invalid alpha-2", () => {
    expect(getCountry("XX")).toBeUndefined();
  });

  test("slug is lowercase alpha-3", () => {
    const c = getCountry("DE");
    expect(c!.slug).toBe("deu");
    expect(c!.alpha3).toBe("deu");
  });
});

describe("getRegion", () => {
  test("resolves DE-BW with localized names", () => {
    const r = getRegion("DE-BW", undefined, ["de", "uk"]);
    expect(r).toBeTruthy();
    expect(r!.code).toBe("DE-BW");
    expect(r!.countryAlpha2).toBe("DE");
    expect(r!.names.de).toBeTruthy();
  });

  test("returns undefined for invalid code", () => {
    expect(getRegion("XX-YY")).toBeUndefined();
  });

  test("applies region name overrides", () => {
    const overrides = {
      regionNames: {
        "DE-BW": { de: "Baden-Württemberg (Custom)", uk: "Баден-Вюртемберг (Кастом)" },
      },
    };
    const r = getRegion("DE-BW", overrides, ["de", "uk"]);
    expect(r!.names.de).toBe("Baden-Württemberg (Custom)");
    expect(r!.names.uk).toBe("Баден-Вюртемберг (Кастом)");
  });
});

describe("buildCityCatalog", () => {
  test("returns cities for DE", () => {
    const cities = buildCityCatalog("DE", undefined, ["de", "uk"]);
    expect(cities.length).toBeGreaterThan(0);
    for (const city of cities) {
      expect(city.id).toMatch(/^de-[a-z]+-/);
      expect(city.regionCode).toMatch(/^DE-/);
      expect(city.names.de).toBeTruthy();
    }
  }, 30000);

  test("applies city name overrides by baseId", () => {
    const overrides = {
      cityNames: {
        "de-bw-freiburg": { de: "Freiburg im Breisgau", uk: "Фрайбург-ім-Брайсгау" },
      },
    };
    const cities = buildCityCatalog("DE", overrides, ["de", "uk"]);
    const freiburg = cities.find((c) => c.id.startsWith("de-bw-freiburg"));
    if (freiburg) {
      expect(freiburg.names.de).toBe("Freiburg im Breisgau");
      expect(freiburg.names.uk).toBe("Фрайбург-ім-Брайсгау");
    }
  });
});

describe("createGeoService", () => {
  test("default config loads DE with cities and regions", () => {
    const service = createGeoService();
    expect(service.allCountries().length).toBe(1);
    expect(service.allCities().length).toBeGreaterThan(0);
    expect(service.allRegions().length).toBeGreaterThan(0);
  });

  test("country() resolves DE", () => {
    const service = createGeoService();
    const de = service.country("DE");
    expect(de).toBeTruthy();
    expect(de!.alpha2).toBe("DE");
  });

  test("region() resolves DE-BW", () => {
    const service = createGeoService();
    const bw = service.region("DE-BW");
    expect(bw).toBeTruthy();
    expect(bw!.code).toBe("DE-BW");
  });

  test("city() resolves by id", () => {
    const service = createGeoService();
    const cities = service.allCities();
    const first = cities[0]!;
    expect(service.city(first.id)).toBe(first);
  });

  test("city() returns undefined for unknown id", () => {
    const service = createGeoService();
    expect(service.city("de-xx-nonexistent")).toBeUndefined();
  });

  test("citiesOfRegion returns cities for DE-BW", () => {
    const service = createGeoService();
    const cities = service.citiesOfRegion("DE-BW");
    expect(cities.length).toBeGreaterThan(0);
    for (const c of cities) {
      expect(c.regionCode).toBe("DE-BW");
    }
  });

  test("citiesOfRegion returns empty for unknown region", () => {
    const service = createGeoService();
    expect(service.citiesOfRegion("DE-XX")).toEqual([]);
  });

  test("citySlug is exposed on the service", () => {
    const service = createGeoService();
    expect(service.citySlug("Berlin", "de")).toBe("berlin");
  });

  test("providerEntries for geo.countries", () => {
    const service = createGeoService();
    const result = service.providerEntries("geo.countries", ["de", "uk"], "de");
    expect(result.entries.length).toBe(1);
    expect(result.entries[0]!.slug).toBe("deu");
    expect(result.entries[0]!.data.name).toBeTruthy();
  });

  test("providerEntries for geo.regions", () => {
    const service = createGeoService();
    const result = service.providerEntries("geo.regions", ["de", "uk"], "de");
    expect(result.entries.length).toBeGreaterThan(0);
    for (const entry of result.entries) {
      expect(entry.slug).toBeTruthy();
      expect(entry.data.name).toBeTruthy();
    }
  });

  test("providerEntries for geo.cities", () => {
    const service = createGeoService();
    const result = service.providerEntries("geo.cities", ["de", "uk"], "de");
    expect(result.entries.length).toBeGreaterThan(0);
    for (const entry of result.entries) {
      expect(entry.slug).toBeTruthy();
      expect(entry.data.name).toBeTruthy();
    }
  });

  test("providerEntries throws for unknown provider", () => {
    const service = createGeoService();
    expect(() => service.providerEntries("geo.unknown", ["de"], "de")).toThrow(/Unknown provider/);
  });

  test("providerEntries applies filterValues", () => {
    const service = createGeoService();
    const allCities = service.allCities();
    const firstCitySlug = allCities[0]!.slugByLang["de"] ?? allCities[0]!.id;
    const filterSet = new Set([firstCitySlug]);
    const result = service.providerEntries("geo.cities", ["de", "uk"], "de", {
      filterValues: filterSet,
    });
    expect(result.entries.length).toBe(1);
  });

  test("providerEntries uses imageResolver", () => {
    const service = createGeoService();
    const result = service.providerEntries("geo.cities", ["de", "uk"], "de", {
      imageResolver: () => "some-image",
    });
    const withImage = result.entries.find((e) => e.data.image === "some-image");
    expect(withImage).toBeTruthy();
  });

  test("providerEntries localized map has neutral slugs", () => {
    const service = createGeoService();
    const result = service.providerEntries("geo.countries", ["de", "uk"], "de");
    for (const [slug, localized] of result.localized) {
      expect(localized.neutral).toBe(slug);
    }
  });

  test("composite city override (Freiburg im Breisgau) is applied", () => {
    const service = createGeoService();
    const cities = service.allCities();
    const freiburg = cities.find((c) => c.id.startsWith("de-bw-freiburg"));
    if (freiburg) {
      expect(freiburg.names.de).toBe("Freiburg im Breisgau");
    }
  });

  test("custom config with multiple countries", () => {
    const service = createGeoService({ countries: ["DE", "AT"], languages: ["de", "uk"] });
    expect(service.allCountries().length).toBe(2);
  });
});

describe("citySlug", () => {
  test("German umlauts are expanded", () => {
    expect(citySlug("München", "de")).toBe("muenchen");
    expect(citySlug("Köln", "de")).toBe("koeln");
    expect(citySlug("Düsseldorf", "de")).toBe("duesseldorf");
  });

  test("English passes through", () => {
    expect(citySlug("Berlin", "en")).toBe("berlin");
    expect(citySlug("New York", "en")).toBe("new-york");
  });

  test("is idempotent", () => {
    const once = citySlug("Frankfurt am Main", "de");
    expect(citySlug(once, "de")).toBe(once);
  });
});
