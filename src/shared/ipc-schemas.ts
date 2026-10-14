import { z } from 'zod'
import { METHOD_CODES, NATURE_CODES } from './ppm-options'

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

// La longueur exacte est contrôlée par le domaine ; ici, seulement une borne qui évite les entrées démesurées.
export const saveOrganizationInputSchema = z.object({ name: z.string().max(1000) })

export const openRegionInputSchema = z.object({
  regionId: z.string().min(1).max(64),
  password: z.string().max(512)
})

// --- Plan de passation (PPM) ---
// Ici on ne contrôle que la forme et les tailles maximales ; les règles métier (champs obligatoires, ordre
// des dates, montants) sont vérifiées par le domaine, qui renvoie un message en français.
const idField = z.string().min(1).max(64)
/** Date au format AAAA-MM-JJ, ou null si non renseignée. */
const dateField = z.string().max(10).nullable()
const amountField = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)

export const ppmIdInputSchema = z.object({ ppmId: idField })

export const createPpmInputSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  elaboratedOn: dateField
})

export const savePpmLineInputSchema = z.object({
  ppmId: idField,
  /** null = nouvelle ligne ; sinon identifiant de la ligne à modifier. */
  lineId: idField.nullable(),
  nature: z.enum(NATURE_CODES),
  object: z.string().max(2000),
  financing: z.string().max(200).nullable(),
  accounts: z.array(z.string().max(50)).max(20),
  plannedLaunchDate: dateField,
  plannedBidOpeningDate: dateField,
  plannedAwardDate: dateField,
  beneficiaries: z.array(z.object({ service: z.string().max(200), amount: amountField })).max(50),
  method: z.enum(METHOD_CODES).nullable(),
  procedureLead: z.string().max(200).nullable()
})

export const removePpmLineInputSchema = z.object({ ppmId: idField, lineId: idField })
