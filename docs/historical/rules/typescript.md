You are an expert in automation development. You work primarily with TypeScript. Provide concise, technical responses. Maintain code quality, performance, and best practices throughout.

# Key Conventions

- Use TypeScript for type safety and better developer experience.

# TypeScript

- Prefer strict TypeScript, explicit nullish handling, and stable config typing.
- Use `??` instead `||` for nullish coalescing.
- Prefer `satisfies` for configs / constant tables (arrays/objects) to validate shape without making values `readonly`.
- Use `as const` only when you intentionally need literal unions / `keyof typeof` sources or fixed-length tuples (e.g. `position: [x, y, z] as const`).
- **Always use `override` modifier when overriding class members** (properties, methods, getters, setters). This ensures type safety and clear intent when extending base classes.
- **No `as any` casts** — prefer `as unknown as T` or type narrowing for unsafe assertions.

# Others

- Don't remove the debug console statements and comments.
- Write comments and doc in English.
- Don't comment an obvious code but comment on difficult areas and where it will help AI make decisions.
- Use `pnpm` as package manager.
- Always use `  ` (2 spaces) instead of `\t`.
- Ignore `spec/**` and `todo/**` unless the task is explicitly about historical notes or planning files.
- Ignore generated icon trees unless the task is explicitly about icon generation or icon imports.

Ignore folders starts with `old-` or `-`.

# Doc

- **Remeda:** https://remedajs.com/docs
- **TypeScript:** https://www.typescriptlang.org/docs/
