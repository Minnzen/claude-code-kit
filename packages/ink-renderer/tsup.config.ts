import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  external: ['react', 'react-reconciler'],
  // @alcalzone/ansi-tokenize is ESM-only; bundle it so the CJS output does
  // not emit a `require()` that crashes on Node ≥ 20. See shared/tsup.config
  // for the longer rationale.
  noExternal: ['@alcalzone/ansi-tokenize'],
})
