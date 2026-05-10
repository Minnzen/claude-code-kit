import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/yoga-layout/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  // @alcalzone/ansi-tokenize is ESM-only ("type": "module" with no `require`
  // export). Without bundling it our CJS output emits `require(...)` which
  // crashes on Node ≥ 20 with ERR_REQUIRE_ESM. Same shape as the 0.3.1
  // semver fix (#1), but semver had dual CJS+ESM so a static import was
  // enough; ansi-tokenize must actually be inlined.
  noExternal: ['@alcalzone/ansi-tokenize'],
})
