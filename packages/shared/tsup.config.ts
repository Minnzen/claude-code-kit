import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/yoga-layout/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  // Bundle ESM-only dependencies into the CJS output. Without this our CJS
  // dist emits `require(...)` calls that fail on Node 20.0–20.16 with
  // ERR_REQUIRE_ESM (Node 20.17+ added stable require-of-ESM support, but
  // we cannot assume every Node-20 consumer is on that minor). Same root
  // cause as the 0.3.1 semver fix (#1); ansi-tokenize and
  // get-east-asian-width are pure ESM with no `require` export, so a static
  // import is not enough — they must actually be inlined.
  noExternal: ['@alcalzone/ansi-tokenize', 'get-east-asian-width'],
})
