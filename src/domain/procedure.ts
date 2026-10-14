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
