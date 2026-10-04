import { z } from 'zod'

/**
 * Schémas Zod du contrat IPC. Utilisés UNIQUEMENT dans le processus principal
 * (le preload sandboxé ne peut pas charger de bibliothèque tierce).
 */
export const appInfoSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1)
})
