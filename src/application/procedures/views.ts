import type { Candidate } from '@domain/candidate'
import type { Ppm } from '@domain/ppm'
import { bidsLocked, type Procedure, procedureProgress } from '@domain/procedure'

export interface ProcedureSummaryView {
  readonly id: string
  readonly reference: string
  readonly object: string
  readonly method: string
  readonly estimatedAmount: number | null
  readonly createdOn: string
  readonly validatedCount: number
  readonly totalSteps: number
  readonly status: string
  readonly nextStep: string | null
  readonly awardedCandidate: string | null
}

export interface PpmLineRefView {
  readonly ppmId: string
  readonly ppmNumber: number
  readonly ppmYear: number
  readonly lineId: string
  readonly object: string
  readonly total: number
}

export interface PpmLineChoiceView extends PpmLineRefView {
  readonly nature: string
  readonly method: string | null
}

export interface BidView {
  readonly id: string
  readonly candidateId: string
  readonly candidateName: string
  readonly amount: number
  readonly awarded: boolean
}

export interface ProcedureDetailView extends ProcedureSummaryView {
  readonly ppmLine: PpmLineRefView | null
  readonly steps: readonly {
    readonly kind: string
    readonly plannedDate: string | null
    readonly actualDate: string | null
    readonly validatedOn: string | null
  }[]
  readonly bids: readonly BidView[]
  readonly bidsLocked: boolean
}

function candidateName(candidates: readonly Candidate[], candidateId: string): string {
  return candidates.find((candidate) => candidate.id === candidateId)?.name ?? '—'
}

export function toSummaryView(
  procedure: Procedure,
  candidates: readonly Candidate[]
): ProcedureSummaryView {
  const progress = procedureProgress(procedure)
  const awarded = procedure.bids.find((bid) => bid.awarded)
  return {
    id: procedure.id,
    reference: procedure.reference,
    object: procedure.object,
    method: procedure.method,
    estimatedAmount: procedure.estimatedAmount,
    createdOn: procedure.createdOn,
    validatedCount: progress.validatedCount,
    totalSteps: progress.total,
    status: progress.status,
    nextStep: progress.nextStep,
    awardedCandidate: awarded === undefined ? null : candidateName(candidates, awarded.candidateId)
  }
}

/** Toutes les lignes de tous les plans, à plat, pour le choix du rattachement. */
export function listLineChoices(ppms: readonly Ppm[]): PpmLineChoiceView[] {
  return ppms.flatMap((ppm) =>
    ppm.lines.map((line) => ({
      ppmId: ppm.id,
      ppmNumber: ppm.number,
      ppmYear: ppm.year,
      lineId: line.id,
      object: line.object,
      total: line.beneficiaries.reduce((sum, beneficiary) => sum + beneficiary.amount, 0),
      nature: line.nature,
      method: line.method
    }))
  )
}

export function toDetailView(
  procedure: Procedure,
  ppms: readonly Ppm[],
  candidates: readonly Candidate[]
): ProcedureDetailView {
  const choice =
    procedure.ppmLineId === null
      ? null
      : (listLineChoices(ppms).find((line) => line.lineId === procedure.ppmLineId) ?? null)
  return {
    ...toSummaryView(procedure, candidates),
    ppmLine:
      choice === null
        ? null
        : {
            ppmId: choice.ppmId,
            ppmNumber: choice.ppmNumber,
            ppmYear: choice.ppmYear,
            lineId: choice.lineId,
            object: choice.object,
            total: choice.total
          },
    steps: procedure.steps.map((step) => ({
      kind: step.kind,
      plannedDate: step.plannedDate,
      actualDate: step.actualDate,
      validatedOn: step.validatedOn
    })),
    bids: procedure.bids.map((bid) => ({
      id: bid.id,
      candidateId: bid.candidateId,
      candidateName: candidateName(candidates, bid.candidateId),
      amount: bid.amount,
      awarded: bid.awarded
    })),
    bidsLocked: bidsLocked(procedure)
  }
}
