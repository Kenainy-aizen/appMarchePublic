import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

const alias = {
  '@domain': resolve('src/domain'),
  '@application': resolve('src/application'),
  '@infrastructure': resolve('src/infrastructure'),
  '@shared': resolve('src/shared')
}

/**
 * En développement uniquement : le serveur Vite injecte un script inline (React Refresh)
 * et utilise un WebSocket (HMR). On assouplit donc la CSP du `index.html`.
 * En production, la CSP stricte du fichier est conservée telle quelle.
 */
function relaxCspInDevelopment(): Plugin {
  return {
    name: 'relax-csp-in-development',
    apply: 'serve',
    transformIndexHtml(html) {
      return html
        .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
        .replace("default-src 'self'", "default-src 'self'; connect-src 'self' ws:")
    }
  }
}

export default defineConfig({
  main: {
    resolve: { alias }
  },
  preload: {
    resolve: { alias }
  },
  renderer: {
    root: resolve('src/renderer'),
    plugins: [react(), relaxCspInDevelopment()],
    resolve: { alias },
    build: {
      rollupOptions: { input: resolve('src/renderer/index.html') }
    }
  }
})
