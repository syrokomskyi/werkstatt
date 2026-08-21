/*
<MODULE_CONTRACT>
<purpose>Unit tests for RFC-0900 — verifies client-testimonial Zod schema validation.</purpose>
<non-goals>
  <item>Does not test command handler logic — validates schema only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0900: established unit test coverage for client-testimonial schema.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect } from "vitest";
import { clientTestimonialSchema } from "../client-testimonial.js";

function makeValidBase() {
  return {
    schema: "pbp/client-testimonial@1",
    id: "testimonial-001",
    type: "client-testimonial",
    status: "published" as const,
    name: "Testimonial from Acme Corp",
    quote: "Working with this team was exceptional.",
    authorName: "Jane Doe",
  };
}

describe("RFC-0900: client-testimonial schema", () => {
  it("accepts valid entity with all required fields", () => {
    const result = clientTestimonialSchema.safeParse(makeValidBase());
    expect(result.success).toBe(true);
  });

  it("accepts valid entity with optional fields populated", () => {
    const data = {
      ...makeValidBase(),
      authorRole: "CTO",
      authorOrganization: "Acme Corp",
      evidenceRef: "evidence-acme-statement",
    };
    const result = clientTestimonialSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("accepts valid entity with optional fields omitted", () => {
    const data = makeValidBase();
    delete (data as Record<string, unknown>).authorRole;
    delete (data as Record<string, unknown>).authorOrganization;
    delete (data as Record<string, unknown>).evidenceRef;
    const result = clientTestimonialSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("rejects missing quote", () => {
    const data = makeValidBase();
    delete (data as Record<string, unknown>).quote;
    const result = clientTestimonialSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects missing authorName", () => {
    const data = makeValidBase();
    delete (data as Record<string, unknown>).authorName;
    const result = clientTestimonialSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects wrong type", () => {
    const data = { ...makeValidBase(), type: "evidence-source" };
    const result = clientTestimonialSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects extra unknown field (strict mode)", () => {
    const data = { ...makeValidBase(), unexpectedField: "value" };
    const result = clientTestimonialSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("accepts all pbpEntityStatusSchema values", () => {
    const statuses = ["draft", "published", "suspended", "retired", "superseded"] as const;
    for (const status of statuses) {
      const data = { ...makeValidBase(), status };
      const result = clientTestimonialSchema.safeParse(data);
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid schema ID", () => {
    const data = { ...makeValidBase(), schema: "wrong/schema@1" };
    const result = clientTestimonialSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects empty quote", () => {
    const data = { ...makeValidBase(), quote: "" };
    const result = clientTestimonialSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects empty authorName", () => {
    const data = { ...makeValidBase(), authorName: "" };
    const result = clientTestimonialSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});
