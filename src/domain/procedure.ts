import { type Ariary } from './shared/ariary'
import { DomainError } from './shared/errors'
import { type IsoDate, parseIsoDate, parseOptionalIsoDate } from './shared/iso-date'
import { oneOf, requiredText } from './shared/text'

/** DAO : appel d'offres ouvert ; AOR : restreint ; DCP : consultation de prix ; AMI / APQ : présélection. */
export const PROCEDURE_METHODS = ['DAO', 'AOR', 'DCP', 'AMI', 'APQ'] as const
export type ProcedureMethod = (typeof PROCEDURE_METHODS)[number]

/** Valide un code reçu de l'extérieur (interface, base) et le convertit en `ProcedureMethod`. */
export function parseProcedureMethod(value: string): ProcedureMethod {
  return oneOf(value, PROCEDURE_METHODS, 'mode de passation')
}

/** Étapes d'une procédure, dans leur ordre normal de déroulement. */
export const STEP_KINDS = [
  'PUBLICATION',
  'OUVERTURE_PLIS',
  'EVALUATION',
  'ATTRIBUTION',
  'APPROBATION'
] as const
export type StepKind = (typeof STEP_KINDS)[number]

export interface ProcedureStep {
  readonly kind: StepKind
  readonly plannedDate: IsoDate | null
  readonly actualDate: IsoDate | null
  readonly validatedOn: IsoDate | null
}

/** Offre déposée par un candidat. */
export interface Bid {
  readonly id: string
  readonly candidateId: string
  readonly amount: Ariary
  readonly awarded: boolean
}

export interface Procedure {
  readonly id: string
  readonly reference: string
  readonly object: string
  readonly method: ProcedureMethod
  readonly ppmLineId: string | null
  readonly estimatedAmount: Ariary | null
  readonly createdOn: IsoDate
  readonly steps: readonly ProcedureStep[]
  readonly bids: readonly Bid[]
}

export interface ProcedureInput {
  readonly id: string
  readonly reference: string
  readonly object: string
  readonly method: ProcedureMethod
  readonly ppmLineId?: string | null
  readonly estimatedAmount?: Ariary | null
  readonly createdOn: string
}

export function createProcedure(input: ProcedureInput): Procedure {
  return {
    id: requiredText(input.id, 'identifiant'),
    reference: requiredText(input.reference, 'référence'),
    object: requiredText(input.object, 'objet'),
    method: input.method,
    ppmLineId: input.ppmLineId ?? null,
    estimatedAmount: input.estimatedAmount ?? null,
    createdOn: parseIsoDate(input.createdOn),
    steps: STEP_KINDS.map((kind) => createStep({ kind })),
    bids: []
  }
}

export interface StepInput {
  readonly kind: StepKind
  readonly plannedDate?: string | null
  readonly actualDate?: string | null
  readonly validatedOn?: string | null
}

export function createStep(input: StepInput): ProcedureStep {
  return {
    kind: input.kind,
    plannedDate: parseOptionalIsoDate(input.plannedDate ?? null),
    actualDate: parseOptionalIsoDate(input.actualDate ?? null),
    validatedOn: parseOptionalIsoDate(input.validatedOn ?? null)
  }
}

export function createBid(input: {
  readonly id: string
  readonly candidateId: string
  readonly amount: Ariary
  readonly awarded?: boolean
}): Bid {
  return {
    id: requiredText(input.id, 'identifiant'),
    candidateId: requiredText(input.candidateId, 'candidat'),
    amount: input.amount,
    awarded: input.awarded ?? false
  }
}

/** Ajoute une offre ; un candidat ne peut déposer qu'une offre par procédure. */
export function addBid(procedure: Procedure, bid: Bid): Procedure {
  if (procedure.bids.some((existing) => existing.candidateId === bid.candidateId)) {
    throw new DomainError(
      'DUPLICATE_BID',
      'Ce candidat a déjà déposé une offre pour cette procédure.'
    )
  }
  return { ...procedure, bids: [...procedure.bids, bid] }
}

/** Libellés français des étapes (utilisés dans les messages d'erreur ; l'interface a les mêmes dans `shared`). */
export const STEP_LABELS: Readonly<Record<StepKind, string>> = {
  PUBLICATION: 'Publication de l’avis',
  OUVERTURE_PLIS: 'Ouverture des plis',
  EVALUATION: 'Évaluation des offres',
  ATTRIBUTION: 'Attribution',
  APPROBATION: 'Approbation du marché'
}

export function parseStepKind(value: string): StepKind {
  return oneOf(value, STEP_KINDS, 'étape')
}

export type ProcedureStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED'

export interface ProcedureProgress {
  readonly validatedCount: number
  readonly total: number
  readonly status: ProcedureStatus
  /** Première étape non validée, ou null quand la procédure est terminée. */
  readonly nextStep: StepKind | null
}

export function findStep(procedure: Procedure, kind: StepKind): ProcedureStep {
  const step = procedure.steps.find((candidate) => candidate.kind === kind)
  if (step === undefined) {
    throw new DomainError('STEP_NOT_FOUND', 'Cette étape n’existe pas dans la procédure.')
  }
  return step
}

export function procedureProgress(procedure: Procedure): ProcedureProgress {
  const validatedCount = procedure.steps.filter((step) => step.validatedOn !== null).length
  const nextStep = procedure.steps.find((step) => step.validatedOn === null)?.kind ?? null
  const status: ProcedureStatus =
    validatedCount === 0
      ? 'NOT_STARTED'
      : validatedCount === procedure.steps.length
        ? 'COMPLETED'
        : 'IN_PROGRESS'
  return { validatedCount, total: procedure.steps.length, status, nextStep }
}

function replaceStep(procedure: Procedure, step: ProcedureStep): Procedure {
  return {
    ...procedure,
    steps: procedure.steps.map((existing) => (existing.kind === step.kind ? step : existing))
  }
}

function neighbourSteps(
  procedure: Procedure,
  kind: StepKind
): { readonly previous: ProcedureStep | null; readonly next: ProcedureStep | null } {
  const index = STEP_KINDS.indexOf(kind)
  const previousKind = STEP_KINDS[index - 1]
  const nextKind = STEP_KINDS[index + 1]
  return {
    previous: previousKind === undefined ? null : findStep(procedure, previousKind),
    next: nextKind === undefined ? null : findStep(procedure, nextKind)
  }
}

export interface ProcedureDetailsInput {
  readonly reference: string
  readonly object: string
  readonly method: ProcedureMethod
  readonly ppmLineId: string | null
  readonly estimatedAmount: Ariary | null
}

/** Modifie l'en-tête. Le mode de passation n'est plus modifiable dès qu'une étape est validée. */
export function updateProcedureDetails(
  procedure: Procedure,
  input: ProcedureDetailsInput
): Procedure {
  if (input.method !== procedure.method && procedureProgress(procedure).validatedCount > 0) {
    throw new DomainError(
      'METHOD_LOCKED',
      'Le mode de passation ne peut plus être modifié : au moins une étape est déjà validée.'
    )
  }
  return {
    ...procedure,
    reference: requiredText(input.reference, 'référence'),
    object: requiredText(input.object, 'objet'),
    method: input.method,
    ppmLineId: input.ppmLineId,
    estimatedAmount: input.estimatedAmount
  }
}

/**
 * Renseigne les dates prévue et réelle d'une étape non validée. La date réelle doit rester dans l'ordre
 * des étapes : jamais avant celle de l'étape précédente, jamais après celle de l'étape suivante.
 */
export function setStepDates(
  procedure: Procedure,
  kind: StepKind,
  dates: { readonly plannedDate: string | null; readonly actualDate: string | null }
): Procedure {
  const step = findStep(procedure, kind)
  if (step.validatedOn !== null) {
    throw new DomainError(
      'STEP_LOCKED',
      `L’étape « ${STEP_LABELS[kind]} » est validée : ses dates ne peuvent plus être modifiées. Rouvrez-la d’abord.`
    )
  }
  const plannedDate = parseOptionalIsoDate(dates.plannedDate)
  const actualDate = parseOptionalIsoDate(dates.actualDate)

  if (actualDate !== null) {
    const { previous, next } = neighbourSteps(procedure, kind)
    if (previous?.actualDate != null && actualDate < previous.actualDate) {
      throw new DomainError(
        'STEP_DATE_BEFORE_PREVIOUS',
        `La date réelle ne peut pas précéder celle de l’étape « ${STEP_LABELS[previous.kind]} ».`
      )
    }
    if (next?.actualDate != null && actualDate > next.actualDate) {
      throw new DomainError(
        'STEP_DATE_AFTER_NEXT',
        `La date réelle ne peut pas suivre celle de l’étape « ${STEP_LABELS[next.kind]} ».`
      )
    }
  }
  return replaceStep(procedure, { ...step, plannedDate, actualDate })
}

/** Valide une étape : la précédente doit l'être, et une date réelle doit être renseignée. */
export function validateStep(procedure: Procedure, kind: StepKind, validatedOn: string): Procedure {
  const step = findStep(procedure, kind)
  if (step.validatedOn !== null) {
    throw new DomainError('STEP_ALREADY_VALIDATED', 'Cette étape est déjà validée.')
  }
  const { previous } = neighbourSteps(procedure, kind)
  if (previous !== null && previous.validatedOn === null) {
    throw new DomainError(
      'PREVIOUS_STEP_NOT_VALIDATED',
      `Validez d’abord l’étape « ${STEP_LABELS[previous.kind]} ».`
    )
  }
  if (step.actualDate === null) {
    throw new DomainError(
      'ACTUAL_DATE_REQUIRED',
      `Renseignez la date réelle de l’étape « ${STEP_LABELS[kind]} » avant de la valider.`
    )
  }
  return replaceStep(procedure, { ...step, validatedOn: parseIsoDate(validatedOn) })
}

/** Rouvre une étape validée par erreur ; impossible si une étape suivante est déjà validée. */
export function reopenStep(procedure: Procedure, kind: StepKind): Procedure {
  const step = findStep(procedure, kind)
  if (step.validatedOn === null) {
    throw new DomainError('STEP_NOT_VALIDATED', 'Cette étape n’est pas validée.')
  }
  const { next } = neighbourSteps(procedure, kind)
  if (next !== null && next.validatedOn !== null) {
    throw new DomainError(
      'LATER_STEP_VALIDATED',
      `Rouvrez d’abord l’étape « ${STEP_LABELS[next.kind]} », qui est validée après celle-ci.`
    )
  }
  return replaceStep(procedure, { ...step, validatedOn: null })
}
