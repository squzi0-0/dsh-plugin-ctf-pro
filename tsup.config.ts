import { defineConfig } from 'tsup'

// Bundles the modular src/ tree into a single CommonJS entry (lib/index.js)
// that DSH loads. Python helpers under tools/ and skill files under skills/
// ship alongside and are resolved at runtime relative to lib/.
export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'lib',
  format: ['cjs'],
  target: 'node18',
  clean: true,
  sourcemap: false,
  dts: false,
  // DSH provides these at runtime; never bundle them in.
  external: ['@deepseek-ai/cordis', '@deepseek-ai/dsh-tools'],
})
