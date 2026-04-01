import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/yoga-layout/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
})
