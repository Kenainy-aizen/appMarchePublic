import { session } from 'electron'

/**
 * Bloque tout accès réseau sortant. Seul le serveur de développement Vite
 * (variable ELECTRON_RENDERER_URL, présente uniquement en `npm run dev`) est autorisé.
 */
export function blockOutgoingNetwork(): void {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  const allowedHost = devUrl ? new URL(devUrl).host : null

  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
    (details, callback) => {
      const isDevServer = allowedHost !== null && new URL(details.url).host === allowedHost
      callback({ cancel: !isDevServer })
    }
  )
}
