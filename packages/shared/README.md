# @claude-code-kit/shared

Shared utilities for claude-code-kit — Yoga layout engine (pure TypeScript port), logger, environment helpers.

Part of [claude-code-kit](https://github.com/Minnzen/claude-code-kit).

## Installation

```bash
pnpm add @claude-code-kit/shared
```

## Included

- `@claude-code-kit/shared`
  Exports semver helpers, env helpers, ANSI-safe slicing, debug logging, and `execFileNoThrow`.
- `@claude-code-kit/shared/yoga-layout`
  Exports the pure TypeScript Yoga layout port used by the renderer.

## Example

```ts
import { gte, execFileNoThrow } from '@claude-code-kit/shared'

if (gte(process.version, '18.0.0')) {
  const result = await execFileNoThrow('node', ['--version'])
  console.log(result.stdout.trim())
}
```

## Docs

- Full project docs: [github.com/Minnzen/claude-code-kit](https://github.com/Minnzen/claude-code-kit)

## License

MIT
