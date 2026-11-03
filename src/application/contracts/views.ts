import type { Candidate } from '@domain/candidate'
import { allowedEventKinds, type Contract, contractStatus, currentAmount } from '@domain/contract'
import type { Ppm } from '@domain/ppm'
import type { Procedure } from '@domain/procedure'
import { isAwarded, listLineChoices, type PpmLineRefView } from '../procedures/views'

export interface ContractSummaryView {
  readonly id: string
  readonly reference: string
  readonly kind: string
  readonly object: string
  readonly holderName: string
  readonly amount: number
  readonly currentAmount: number
  readonly signedOn: string | null
  readonly status: string
}

export interface ContractDetailView extends ContractSummaryView {
  readonly holderId: string
  readonly procedure: { readonly id: string; readonly reference: string } | null
  readonly ppmLine: PpmLineRefView | null
  readonly events: readonly {
    readonly id: string
    readonly kind: string
    readonly occurredOn: string
    readonly amountDelta: number | null
    readonly note: string | null
  }[]
  readonly allowedEvents: readonly string[]
  readonly headerLocked: boolean
}

export interface ContractableProcedureView {
  readonly id: string
  readonly reference: string
  readonly object: string
  readonly holderId: string
  readonly holderName: string
  readonly amount: number
  readonly ppmLineId: string | null
}

function holderNameOf(candidates: readonly Candidate[], holderId: string): string {
  return candidates.find((candidate) => candidate.id === holderId)?.name ?? '—'
}

export function toSummaryView(
  contract: Contract,
  candidates: readonly Candidate[]
): ContractSummaryView {
  return {
    id: contract.id,
    reference: contract.reference,
    kind: contract.kind,
    object: contract.object,
    holderName: holderNameOf(candidates, contract.holderId),
    amount: contract.amount,
    currentAmount: currentAmount(contract),
    signedOn: contract.signedOn,
    status: contractStatus(contract)
  }
}

export function toDetailView(
  contract: Contract,
  candidates: readonly Candidate[],
  procedures: readonly Procedure[],
  ppms: readonly Ppm[]
): ContractDetailView {
  const procedure = procedures.find((candidate) => candidate.id === contract.procedureId) ?? null
  const choice =
    contract.ppmLineId === null
      ? null
      : (listLineChoices(ppms).find((line) => line.lineId === contract.ppmLineId) ?? null)
  return {
    ...toSummaryView(contract, candidates),
    holderId: contract.holderId,
    procedure: procedure === null ? null : { id: procedure.id, reference: procedure.reference },
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
    events: contract.events.map((event) => ({
      id: event.id,
      kind: event.kind,
      occurredOn: event.occurredOn,
      amountDelta: event.amountDelta,
      note: event.note
    })),
    allowedEvents: allowedEventKinds(contract),
    headerLocked: contract.events.length > 0
  }
}

/** Procédures attribuées et sans marché, avec l'attributaire et le montant de son offre retenue. */
export function listContractableProcedures(
  procedures: readonly Procedure[],
  contracts: readonly Contract[],
  candidates: readonly Candidate[]
): ContractableProcedureView[] {
  return procedures
    .filter(
      (procedure) =>
        isAwarded(procedure) && !contracts.some((contract) => contract.procedureId === procedure.id)
    )
    .flatMap((procedure) => {
      const awarded = procedure.bids.find((bid) => bid.awarded)
      if (awarded === undefined) return []
      return [
        {
          id: procedure.id,
          reference: procedure.reference,
          object: procedure.object,
          holderId: awarded.candidateId,
          holderName: holderNameOf(candidates, awarded.candidateId),
          amount: awarded.amount,
          ppmLineId: procedure.ppmLineId
        }
      ]
    })
}
