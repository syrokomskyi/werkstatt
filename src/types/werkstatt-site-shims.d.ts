// Wildcard ambient declaration for @warpgogol/werkstatt-site subpath imports.
// In the monorepo, pnpm.overrides makes werkstatt-site resolvable via node_modules,
// so real types take precedence over this wildcard. In the extracted standalone repo,
// werkstatt-site is not installed, so this wildcard provides fallback type information
// for dynamic import() calls.
declare module "@warpgogol/werkstatt-site/*" {
  const _default: any;
  export = _default;
}
