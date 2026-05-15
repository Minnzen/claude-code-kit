import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  external: ['react', 'react-reconciler'],
  // Bundle every ESM-only dep into the CJS output so consumers on Node
  // 20.0–20.16 (which lacks stable require-ESM) do not hit ERR_REQUIRE_ESM.
  //
  // The list below is the union of every third-party require()'d at the top
  // of the built CJS that ships as `"type": "module"` with no `require`
  // export. Verified by:
  //   grep -oE 'require\("[a-z@][^"]*"\)' dist/index.js | sort -u
  // and inspecting each package.json. If you add a new dependency that is
  // ESM-only, add it here too — otherwise consumers on Node 20.0–20.16
  // will crash on require().
  noExternal: ['chalk', 'figures', 'marked', 'strip-ansi'],
})
