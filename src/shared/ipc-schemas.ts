import { z } from 'zod'

/**
 * Schémas Zod du contrat IPC. Utilisés UNIQUEMENT dans le processus principal
 * (le preload sandboxé ne peut pas charger de bibliothèque tierce).
 * Les longueurs maximales évitent qu'une entrée démesurée ne bloque la dérivation de clé.
 */
export const appInfoSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1)
})

export const createRegionInputSchema = z.object({
  name: z.string().max(200),
  password: z.string().max(512),
  passwordConfirmation: z.string().max(512)
})

export const openRegionInputSchema = z.object({
  regionId: z.string().min(1).max(64),
  password: z.string().max(512)
})
