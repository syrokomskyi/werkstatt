/*
<MODULE_CONTRACT>
<purpose>PBP ClientTestimonial entity for client gratitude display (RFC-0900).</purpose>
<non-goals>
  <item>Does not define evidence-source semantics — testimonials are not cryptographic evidence.</item>
  <item>Does not define consent management — consent is handled by the consent entity (RFC-0706).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0900 — PbpClientTestimonial entity for client gratitude display on Nachweise page.</item>
</CHANGE_SUMMARY>
*/

import type { PbpEntity } from "../envelope.js";
import { pbpSchemaId } from "../schema-id.js";

export const CLIENT_TESTIMONIAL_SCHEMA_ID = pbpSchemaId("client-testimonial");

export interface PbpClientTestimonial extends PbpEntity {
  type: "client-testimonial";
  name: string;
  quote: string;
  authorName: string;
  authorRole?: string;
  authorOrganization?: string;
  evidenceRef?: string;
}
