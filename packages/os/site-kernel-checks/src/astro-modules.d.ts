/*
<MODULE_CONTRACT>
<purpose>Ambient Astro virtual-module declarations used when typechecking site-kernel-checks outside an Astro app.</purpose>
<non-goals>
  <item>Do not model app-specific Astro collection types; checks need only compile-time compatibility.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Add ambient declarations so the checks package can typecheck Astro virtual imports outside app runtime.</item>
</CHANGE_SUMMARY>
*/

declare module "astro:content" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function getCollection(name: string): Promise<any[]>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function getEntryBySlug(collection: string, slug: string): Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function getEntry(collection: string, slug: string): Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function getEntries(slugs: Array<{ collection: string; slug: string }>): Promise<any[]>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function reference(slug: string): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const getDataEntryById: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const getEntryById: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const render: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const defineCollection: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const z: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type CollectionEntry<T> = any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type InferEntrySchema<T> = any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type ContentCollectionKey = any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type DataCollectionKey = any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type Render = any;
}

declare module "astro:middleware" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function defineMiddleware(fn: any): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function sequence(...middleware: any[]): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type MiddlewareNext = any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type MiddlewareHandler = any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type APIContext = any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type Locals = any;
}
