import { test, expect } from "vitest";
import { substituteRefsDeep } from "../content/substitute-deep.ts";

// RFC-0138 fixture: a tiny disk-free stand-in for the RFC-0045 resolver. It models the
// canonical business offer file so we can assert a {business.offer.price.*} reference written
// in a block prop renders the resolved value — the validator/runtime alignment the RFC requires.
const OFFER: Record<string, string> = {
  "{business.offer.price.monthly}": "70 €/Monat",
  "{business.offer.price.yearly}": "700 €/Jahr",
  "{business.offer.price.setup}": "200 € Einrichtung",
};

const REFERENCE_PATTERN = /\{[a-z]+\.[a-z0-9-]+\.[a-zA-Z0-9_.]+\}/g;

async function fakeResolve(value: string): Promise<string> {
  return value.replace(REFERENCE_PATTERN, (match) => OFFER[match] ?? "");
}

test("substituteRefsDeep resolves a reference in a price-card prop", async () => {
  const props = {
    plan: "Standard",
    price: { monthly: "{business.offer.price.monthly}", yearly: "{business.offer.price.yearly}" },
  };

  const resolved = (await substituteRefsDeep(props, fakeResolve)) as typeof props;

  expect(resolved.price.monthly).toBe("70 €/Monat");
  expect(resolved.price.yearly).toBe("700 €/Jahr");
  // The literal brace string must not survive into the rendered prop.
  expect(!resolved.price.monthly.includes("{")).toBeTruthy();
});

test("substituteRefsDeep resolves references inside arrays", async () => {
  const props = {
    cards: [
      { label: "Monat", value: "{business.offer.price.monthly}" },
      { label: "Einrichtung", value: "{business.offer.price.setup}" },
    ],
  };

  const resolved = (await substituteRefsDeep(props, fakeResolve)) as typeof props;

  expect(resolved.cards[0].value).toBe("70 €/Monat");
  expect(resolved.cards[1].value).toBe("200 € Einrichtung");
});

test("substituteRefsDeep passes non-string leaves through unchanged", async () => {
  const props = {
    enabled: true,
    order: 3,
    ratio: 0.5,
    nothing: null,
    nested: { animated: false, count: 0 },
  };

  const resolved = (await substituteRefsDeep(props, fakeResolve)) as typeof props;

  expect(resolved).toEqual(props);
});

test("substituteRefsDeep does not mutate the input", async () => {
  const props = { price: { monthly: "{business.offer.price.monthly}" } };
  await substituteRefsDeep(props, fakeResolve);
  expect(props.price.monthly).toBe("{business.offer.price.monthly}");
});
