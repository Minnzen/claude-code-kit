import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  external: ['react', 'react-reconciler'],
  // marked v17+ is ESM-only ("type": "module" with no `require` export). Same
  // CJS interop issue as the 0.3.1 semver fix: without bundling, our CJS
  // output emits `require("marked")` which crashes on Node ≥ 20.
  noExternal: ['marked'],
})
