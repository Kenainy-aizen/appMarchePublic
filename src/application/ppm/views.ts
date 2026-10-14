import { type Ppm, type PpmLine, ppmLineTotal, ppmTotal } from '@domain/ppm'

/** Ce que l'interface reçoit : valeurs simples (chaînes, nombres), montants déjà totalisés. */
export interface PpmSummaryView {
  readonly id: string
  readonly year: number
  readonly number: number
  readonly elaboratedOn: string
  readonly lastUpdateOn: string | null
  readonly updateCount: number
  readonly lineCount: number
  readonly total: number
}

export interface PpmLineView {
  readonly id: string
  readonly nature: string
  readonly object: string
  readonly financing: string | null
  readonly accounts: readonly string[]
  readonly plannedLaunchDate: string | null
  readonly plannedBidOpeningDate: string | null
  readonly plannedAwardDate: string | null
  readonly beneficiaries: readonly { readonly service: string; readonly amount: number }[]
  readonly method: string | null
  readonly procedureLead: string | null
  readonly total: number
}

export interface PpmDetailView extends PpmSummaryView {
  readonly lines: readonly PpmLineView[]
}

export function toSummaryView(ppm: Ppm): PpmSummaryView {
  return {
    id: ppm.id,
    year: ppm.year,
    number: ppm.number,
    elaboratedOn: ppm.elaboratedOn,
    lastUpdateOn: ppm.lastUpdateOn,
    updateCount: ppm.updateCount,
    lineCount: ppm.lines.length,
    total: ppmTotal(ppm)
  }
}

function toLineView(line: PpmLine): PpmLineView {
  return {
    id: line.id,
    nature: line.nature,
    object: line.object,
    financing: line.financing,
    accounts: line.accounts,
    plannedLaunchDate: line.plannedLaunchDate,
    plannedBidOpeningDate: line.plannedBidOpeningDate,
    plannedAwardDate: line.plannedAwardDate,
    beneficiaries: line.beneficiaries.map(({ service, amount }) => ({ service, amount })),
    method: line.method,
    procedureLead: line.procedureLead,
    total: ppmLineTotal(line)
  }
}

export function toDetailView(ppm: Ppm): PpmDetailView {
  return { ...toSummaryView(ppm), lines: ppm.lines.map(toLineView) }
}
