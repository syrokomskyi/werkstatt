---
name: setup-ecosystem
description: Configure git hooks and verify ecosystem tooling. Run after cloning or when setting up a new development environment.
invocation: user
category: fo
concerns: code-mutation
dependsOn: ['my-preferences']
languagePolicy: ref(PREFERENCES.md)
---

# setup-ecosystem

Before starting, read `PREFERENCES.md` at the repository root. If the file is missing or `aiLanguage` is unset, ask the operator once and create the file using the `my-preferences` skill semantics.

Configure the local development ecosystem: git hooks, hook executability, and `ecosystem.commit` command verification. This skill is project-specific (WGogol-only) and is NOT a portable forge skill.

## Process

### 1. Verify prerequisites

Check that `pnpm install` has been run:

```sh
test -d node_modules
```

If `node_modules/` does not exist, report to the operator: "node_modules/ not found. Run `pnpm install` first." and abort.

### 2. Configure git hooks

Run:

```sh
git config core.hooksPath hooks/
```

This activates the versioned pre-commit hook at `hooks/pre-commit` (RFC-0533).

### 3. Verify hook executable

Run:

```sh
chmod +x hooks/pre-commit
test -x hooks/pre-commit
```

If `hooks/pre-commit` does not exist or is not executable, report: "hooks/pre-commit not found. Ensure RFC-0533 is implemented." and abort.

### 4. Verify ecosystem.commit

Run:

```sh
node packages/os/site-kernel/bin/site-kernel.mjs run ecosystem.commit --dry-run --message "setup verification"
```

If the command fails or is not found, report: "ecosystem.commit command not found. Ensure RFC-0533 is implemented." and abort.

### 5. Report success

Report to the operator: "Ecosystem setup complete. Hooks configured, ecosystem.commit verified."

## Failure modes

| Condition | Exit code | Behavior |
| --- | --- | --- |
| `node_modules/` does not exist | 1 | Skill reports: "node_modules/ not found. Run `pnpm install` first." and aborts. |
| `hooks/pre-commit` does not exist | 1 | Skill reports: "hooks/pre-commit not found. Ensure RFC-0533 is implemented." and aborts. |
| `ecosystem.commit` not registered | 1 | Skill reports: "ecosystem.commit command not found. Ensure RFC-0533 is implemented." and aborts. |
| `git config core.hooksPath hooks/` fails | 1 | Skill reports the git error and suggests checking repository permissions. Aborts. |
| All steps pass | 0 | Skill reports: "Ecosystem setup complete. Hooks configured, ecosystem.commit verified." |

## Completion criteria

- `git config core.hooksPath` is set to `hooks/`.
- `hooks/pre-commit` exists and is executable.
- `ecosystem.commit --dry-run` returns successfully.

## Constraints

- **User-invoked only.** Never auto-run.
- **Project-specific skill.** This skill is WGogol-only and lives at `.agents/skills/setup-ecosystem/SKILL.md`. It is NOT a portable forge skill and must not be added to `packages/forge/skills/`.
- **Dependency on RFC-0533.** This skill verifies `hooks/pre-commit` and `ecosystem.commit` exist; if they do not, the skill reports the missing dependency and aborts.
- **Read `_shared/fo-pipeline-conventions.md`** for commit discipline, language policy, and build verification rules.
