import type { z } from 'zod'
import type { appInfoSchema } from './ipc-schemas'

// Types uniquement : aucun code n'est émis dans les bundles preload / renderer.
export type AppInfoDto = z.infer<typeof appInfoSchema>

/** API exposée à l'interface React via `window.api` (contrat typé). */
export interface PrmpApi {
  getAppInfo(): Promise<AppInfoDto>
}
