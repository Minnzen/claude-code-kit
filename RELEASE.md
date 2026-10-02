# Release procedure

The checkout and verified npm release are `0.4.0`. All five packages are published. A successful local check, a pushed commit, a GitHub release, and an npm release are distinct outcomes.

Publishing and pushing release tags require explicit authorization. This document describes the manual procedure; reading or updating it does not authorize publication.

## Validate the candidate

Use Node.js 22.12+ and the pnpm version declared in the root `package.json`. Packed runtime packages support Node.js 22.0+:

```bash
pnpm install --frozen-lockfile
pnpm release:check
```

This runs build, typecheck, tests, lint, workspace import smoke, and `smoke:packed`. The packed check creates tarballs, installs them in fresh full/UI-only consumer projects with a fresh npm cache and no npm credentials, and exercises ESM/CJS/tsx, the headless agent, and a mounted terminal fixture. It excludes workspace symlinks and verifies the optional-agent boundary. Inspect packed files and dependency versions before publishing.

Local checks use the current Node version unless explicitly configured. CI builds/checks on Node 22.12 / 24 and adds a packed-runtime job at Node 22.0. A configured workflow does not prove a passing remote run. Renderer fixtures exercise terminal input/output in a controlled stream; they do not establish live provider or real user-terminal acceptance.

All five package versions must agree. Confirm the intended version, a clean reviewed diff, and the release commit before any publish operation. Do not upgrade a package's runtime or peer requirements without updating the installation and migration docs.

Before publishing, verify applicable licenses and redistribution permissions, inventory installed production dependency licenses, and inspect bundled dependency files/notices. Check every candidate tarball for its package `LICENSE`, and the shared, ink-renderer, and UI tarballs for `THIRD_PARTY_NOTICES.md` and the included license texts. Preserve required license texts and copyright notices. Record unresolved review findings separately from local runtime/test validation.

## Publish npm packages manually

After release authorization, authenticate to npm and verify the account with `npm whoami`. Publish in dependency order:

```bash
pnpm --filter @claude-code-kit/shared publish --access public --no-git-checks
pnpm --filter @claude-code-kit/ink-renderer publish --access public --no-git-checks
pnpm --filter @claude-code-kit/agent publish --access public --no-git-checks
pnpm --filter @claude-code-kit/tools publish --access public --no-git-checks
pnpm --filter @claude-code-kit/ui publish --access public --no-git-checks
```

`--no-git-checks` skips pnpm's Git guard; it does not replace review or validation. If a publish result is unclear, check that package's registry version before retrying. npm versions are immutable, and a partial release must be reconciled package by package.

Verify every published package with `npm view <package> version`. In a clean temporary consumer project, install the exact release versions with React 19.2.x and react-reconciler 0.33.x, then check ESM, CommonJS, and tsx imports and a real terminal example. A tarball dry run or source test suite alone does not establish installed-package behavior.

## GitHub tag and release

With separate authorization to push, tag the verified release commit using `v<version>` and push that tag. The `Release` workflow checks the tag against all package versions, runs `pnpm release:check`, and creates a GitHub release with generated notes.

The workflow does **not** run npm publishing. Pushing a tag or creating a GitHub release does not make a package available on npm.

After release verification, update the current version and evidence in the root READMEs, `docs/roadmap.md`, and `AGENTS.md`. Keep the release date, npm version, local check result, and remote CI result separate.

## Upgrade from 0.3.1 to 0.4.0

Release `0.4.0` includes runtime and API changes from npm `0.3.1`. The installation commands in the READMEs pin `0.4.0`. Review these changes before upgrading:

- Use Node.js 22+, React 19.2.x, and react-reconciler 0.33.x; React 18 and older reconciler lines are outside this runtime contract.
- Import the stateful `useTheme` from `@claude-code-kit/ui` and wrap the app in `ThemeProvider`. The renderer's former no-op `useTheme` export is removed.
- Await `agent.cancel()` before clearing or replacing an active run. `agent.clearMessages()` is synchronous and requires idle, as do provider/tool/permission setters and MCP disconnection. `abort()` requests cancellation synchronously; `waitForIdle()` only waits. Consumers must continue draining or close the run iterator so it can finish.
- Await the UI bridge's `cancel()` and `clearMessages()` when subsequent work depends on completion. `REPL.onCancel` handles loading-state keyboard cancellation; optional `onError` observes callback failures and may return a promise.
- `FileSession.setMessages()` and `clear()` update memory only. Call `save()` or `FileSessionStore.save()` to persist the new history; `append()` persists one message and does not implicitly save other in-memory changes.
- Denied or failed tools return error results. Explicit allow lists/callbacks are required for write operations; `autoApproveReadOnly` does not approve writes.
- `PermissionResult.approvalRequired: true` lets an interactive host ask about a denial caused by missing approval. The bridge preserves existing allows and explicit denials; it prompts only for denial with that flag. Custom denials without it and `alwaysDeny` cannot be overridden. The headless Agent still executes only `decision: 'allow'`.
- The UI's `always_allow` now retains a tool-name grant across runs in the current mount. It remains in memory, resets when switching Agent/unmounting, and remains subordinate to the original policy's explicit denials.
- Keep UI and Agent versions compatible when using the bridge. The 0.4.0 UI package's optional Agent peer is `^0.4.0`; UI-only consumers do not need to install Agent.
- Optional provider and MCP SDKs must be installed when those integrations are used.
