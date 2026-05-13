import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  external: ['react', 'react-reconciler'],
  // Bundle every ESM-only dep into the CJS output so consumers on Node
  // 20.0–20.16 (which lacks stable require-ESM) do not hit ERR_REQUIRE_ESM.
  // See shared/tsup.config for the longer rationale.
  noExternal: ['@alcalzone/ansi-tokenize', 'get-east-asian-width', 'supports-hyperlinks'],
})
