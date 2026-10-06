import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@domain': resolve('src/domain'),
      '@application': resolve('src/application'),
      '@infrastructure': resolve('src/infrastructure'),
      '@shared': resolve('src/shared')
    }
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    // Filet de sécurité pour les postes lents (le calcul de clé scrypt est volontairement coûteux).
    testTimeout: 30_000,
    hookTimeout: 30_000
  }
})
