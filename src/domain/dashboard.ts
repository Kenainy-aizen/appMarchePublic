import type { Candidate } from './candidate'
import { type Contract, type ContractStatus, contractStatus, currentAmount } from './contract'
import { type Ppm, ppmTotal } from './ppm'
import {
  isProcedureAwarded,
  PROCEDURE_METHODS,
  type Procedure,
  type ProcedureMethod,
  procedureProgress
} from './procedure'

export interface PlanProgress {
  readonly planId: string
  readonly year: number
  readonly number: number
  readonly lineCount: number
  /** Lignes ayant donné lieu à au moins une procédure ou un contrat. */
  readonly launchedLineCount: number
  /** Part des lignes lancées, de 0 à 100 (calculée une seule fois, ici). */
  readonly launchRatePercent: number
  readonly plannedAmount: number
  /** Montant actuel (avenants compris) des contrats rattachés aux lignes de ce plan. */
  readonly contractedAmount: number
}

export interface MethodFigures {
  readonly method: ProcedureMethod
  readonly count: number
  readonly estimatedAmount: number
}

export interface Dashboard {
  readonly plans: readonly PlanProgress[]
  readonly procedures: {
    readonly total: number
    readonly notStarted: number
    readonly inProgress: number
    readonly completed: number
    /** Procédures dont l'attribution est validée. */
    readonly awarded: number
    /** Seulement les modes utilisés, dans l'ordre habituel (DAO, AOR, DCP, AMI, APQ). */
    readonly byMethod: readonly MethodFigures[]
  }
  readonly contracts: {
    readonly total: number
    readonly byStatus: Readonly<Record<ContractStatus, number>>
    readonly initialAmount: number
    /** Somme des variations des avenants (positive ou négative). */
    readonly amendmentsAmount: number
    readonly currentAmount: number
  }
  readonly candidates: {
    readonly total: number
    readonly bids: number
    readonly awardedBids: number
  }
}

export interface DashboardInput {
  readonly ppms: readonly Ppm[]
  readonly procedures: readonly Procedure[]
  readonly contracts: readonly Contract[]
  readonly candidates: readonly Candidate[]
}

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0)

/**
 * Indicateurs de la région (ADR-032). Calculés à l'affichage, jamais enregistrés ; ils portent sur toutes les
 * données de la région (pas de filtre par année). Le rattachement d'un contrat à une ligne du plan est celui
 * du contrat, à défaut celui de sa procédure d'origine.
 */
export function computeDashboard(input: DashboardInput): Dashboard {
  const lineOf = (contract: Contract): string | null =>
    contract.ppmLineId ??
    input.procedures.find((procedure) => procedure.id === contract.procedureId)?.ppmLineId ??
    null

  const usedLines = new Set<string>([
    ...input.procedures.flatMap((procedure) =>
      procedure.ppmLineId === null ? [] : [procedure.ppmLineId]
    ),
    ...input.contracts.flatMap((contract) => {
      const line = lineOf(contract)
      return line === null ? [] : [line]
    })
  ])

  const plans: PlanProgress[] = input.ppms.map((ppm) => {
    const lineIds = new Set(ppm.lines.map((line) => line.id))
    const launchedLineCount = ppm.lines.filter((line) => usedLines.has(line.id)).length
    return {
      planId: ppm.id,
      year: ppm.year,
      number: ppm.number,
      lineCount: ppm.lines.length,
      launchedLineCount,
      launchRatePercent: launchRate(ppm.lines.length, launchedLineCount),
      plannedAmount: ppmTotal(ppm),
      contractedAmount: sum(
        input.contracts.flatMap((contract) => {
          const line = lineOf(contract)
          return line !== null && lineIds.has(line) ? [currentAmount(contract)] : []
        })
      )
    }
  })

  const statuses = input.procedures.map((procedure) => procedureProgress(procedure).status)
  const byMethod: MethodFigures[] = PROCEDURE_METHODS.flatMap((method) => {
    const ofMethod = input.procedures.filter((procedure) => procedure.method === method)
    return ofMethod.length === 0
      ? []
      : [
          {
            method,
            count: ofMethod.length,
            estimatedAmount: sum(ofMethod.map((procedure) => procedure.estimatedAmount ?? 0))
          }
        ]
  })

  const byStatus: Record<ContractStatus, number> = {
    NOT_STARTED: 0,
    IN_PROGRESS: 0,
    STOPPED: 0,
    PROVISIONALLY_RECEIVED: 0,
    FINALLY_RECEIVED: 0,
    CLOSED: 0
  }
  for (const contract of input.contracts) byStatus[contractStatus(contract)] += 1
  const initialAmount = sum(input.contracts.map((contract) => contract.amount))
  const totalNow = sum(input.contracts.map((contract) => currentAmount(contract)))

  const bids = input.procedures.flatMap((procedure) => procedure.bids)

  return {
    plans,
    procedures: {
      total: input.procedures.length,
      notStarted: statuses.filter((status) => status === 'NOT_STARTED').length,
      inProgress: statuses.filter((status) => status === 'IN_PROGRESS').length,
      completed: statuses.filter((status) => status === 'COMPLETED').length,
      awarded: input.procedures.filter(isProcedureAwarded).length,
      byMethod
    },
    contracts: {
      total: input.contracts.length,
      byStatus,
      initialAmount,
      amendmentsAmount: totalNow - initialAmount,
      currentAmount: totalNow
    },
    candidates: {
      total: input.candidates.length,
      bids: bids.length,
      awardedBids: bids.filter((bid) => bid.awarded).length
    }
  }
}

/** Part des lignes lancées, entre 0 et 100 (0 quand le plan n'a aucune ligne). */
export function launchRate(lineCount: number, launchedLineCount: number): number {
  return lineCount === 0 ? 0 : Math.round((launchedLineCount / lineCount) * 100)
}
