/* 
<MODULE_CONTRACT> 
<purpose>Serves as a central export point for various script modules utilized in dynamic loading contexts.</purpose> 
 
 
<non-goals> 
<item>Do not define new modules or components.</item> 
<item>Do not manage application state or business logic.</item> 
</non-goals> 
</MODULE_CONTRACT> 
 
<CHANGE_SUMMARY>
  <item>Added Compass scaffolding to clarify module roles and prevent scope creep.</item>
</CHANGE_SUMMARY> 
*/

// scheduler.ts is loaded dynamically by orchestrator.ts and lordicon.ts
export * from "./lordicon.ts";
export * from "./external-links.ts";
export * from "./lenis.ts";
export * from "./orchestrator.ts";
// gsap-counter.ts (RFC-0040) is loaded dynamically by orchestrator.ts
// inline-number-animation.ts (RFC-0041) is loaded dynamically by orchestrator.ts
// gsap-reveal.ts / gsap-parallax.ts / gsap-stagger.ts (RFC-0106) are loaded
// dynamically by orchestrator.ts via the reveal / parallax / stagger opt-ins.
