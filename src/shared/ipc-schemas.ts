import { z } from 'zod'
import { METHOD_CODES, NATURE_CODES } from './ppm-options'
import { ALERT_HORIZON_CHOICES } from './alert-options'
import { ATTACHMENT_OWNER_CODES, MAX_ATTACHMENT_BYTES } from './attachment-options'
import { CONTRACT_EVENT_CODES, CONTRACT_KIND_CODES } from './contract-options'
import { STEP_CODES } from './procedure-options'

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

// --- Procédures de passation ---
export const procedureIdInputSchema = z.object({ procedureId: idField })

export const createProcedureInputSchema = z.object({
  reference: z.string().max(100),
  object: z.string().max(2000),
  method: z.enum(METHOD_CODES),
  /** Ligne du plan de passation à laquelle la procédure se rattache (facultatif). */
  ppmLineId: idField.nullable(),
  estimatedAmount: amountField.nullable()
})

export const updateProcedureInputSchema = createProcedureInputSchema.extend({
  procedureId: idField
})

export const saveStepDatesInputSchema = z.object({
  procedureId: idField,
  step: z.enum(STEP_CODES),
  plannedDate: dateField,
  actualDate: dateField
})

/** Valider ou rouvrir une étape. */
export const stepInputSchema = z.object({ procedureId: idField, step: z.enum(STEP_CODES) })

// --- Candidats et offres ---
const candidateFields = {
  name: z.string().max(200),
  nif: z.string().max(50).nullable(),
  stat: z.string().max(50).nullable(),
  address: z.string().max(300).nullable(),
  phone: z.string().max(50).nullable(),
  email: z.string().max(120).nullable()
}

export const createCandidateInputSchema = z.object(candidateFields)
export const updateCandidateInputSchema = z.object({ candidateId: idField, ...candidateFields })
export const candidateIdInputSchema = z.object({ candidateId: idField })

export const addBidInputSchema = z.object({
  procedureId: idField,
  candidateId: idField,
  amount: amountField
})
export const updateBidInputSchema = z.object({
  procedureId: idField,
  bidId: idField,
  amount: amountField
})
export const removeBidInputSchema = z.object({ procedureId: idField, bidId: idField })
/** `bidId` = null retire la désignation de l'offre retenue. */
export const setAwardInputSchema = z.object({ procedureId: idField, bidId: idField.nullable() })

// --- Contrats et exécution ---
const contractFields = {
  reference: z.string().max(100),
  object: z.string().max(2000),
  holderId: idField,
  ppmLineId: idField.nullable(),
  amount: amountField,
  signedOn: dateField
}

export const createContractInputSchema = z.object({
  kind: z.enum(CONTRACT_KIND_CODES),
  /** Procédure d'origine : obligatoire pour un marché, interdite pour une convention ou un achat direct. */
  procedureId: idField.nullable(),
  ...contractFields
})
export const updateContractInputSchema = z.object({ contractId: idField, ...contractFields })
export const contractIdInputSchema = z.object({ contractId: idField })
export const addContractEventInputSchema = z.object({
  contractId: idField,
  kind: z.enum(CONTRACT_EVENT_CODES),
  occurredOn: z.string().max(10),
  /** Variation de montant : obligatoire pour un avenant, ignorée sinon. */
  amountDelta: z
    .number()
    .int()
    .min(-Number.MAX_SAFE_INTEGER)
    .max(Number.MAX_SAFE_INTEGER)
    .nullable(),
  note: z.string().max(500).nullable()
})

// --- Documents joints ---
export const attachmentOwnerInputSchema = z.object({
  ownerKind: z.enum(ATTACHMENT_OWNER_CODES),
  ownerId: idField
})

export const addAttachmentInputSchema = z.object({
  ownerKind: z.enum(ATTACHMENT_OWNER_CODES),
  ownerId: idField,
  /** Nom d'origine du fichier ; nettoyé et vérifié par le domaine. */
  fileName: z.string().min(1).max(255),
  /** Contenu du fichier (taille bornée ici pour ne jamais traiter une charge démesurée). */
  bytes: z.instanceof(Uint8Array).refine((bytes) => bytes.length <= MAX_ATTACHMENT_BYTES, {
    message: 'Le fichier dépasse la taille maximale.'
  }),
  note: z.string().max(500).nullable()
})

export const attachmentIdInputSchema = z.object({ attachmentId: idField })

// --- Alertes d'échéances ---
export const saveAlertHorizonInputSchema = z.object({
  /** 7, 15, 30 ou 60 jours : toute autre valeur est refusée à la frontière. */
  days: z.number().refine((days) => (ALERT_HORIZON_CHOICES as readonly number[]).includes(days), {
    message: 'Délai d’alerte invalide.'
  })
})
