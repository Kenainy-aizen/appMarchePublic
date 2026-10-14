import { addPpmLine, createPpmLine, parseProcurementNature, replacePpmLine } from '@domain/ppm'
import { parseProcedureMethod } from '@domain/procedure'
import { ariary } from '@domain/shared/ariary'
import type { IdGenerator } from '@domain/shared/ports'
import type { RegionSession } from '../region-session'
import { requirePpm } from './ppm-access'
import { type PpmDetailView, toDetailView } from './views'

export interface SavePpmLineInput {
  readonly ppmId: string
  /** null = nouvelle ligne ; sinon identifiant de la ligne à modifier. */
  readonly lineId: string | null
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
}

/** Ajoute une ligne au plan, ou modifie une ligne existante. Toutes les règles métier sont dans le domaine. */
export class SavePpmLineUseCase {
  constructor(
    private readonly session: RegionSession,
    private readonly ids: IdGenerator
  ) {}

  execute(input: SavePpmLineInput): PpmDetailView {
    const { ppms } = this.session.requireWorkspace().repositories
    const ppm = requirePpm(ppms, input.ppmId)

    const line = createPpmLine({
      id: input.lineId ?? this.ids.newId(),
      nature: parseProcurementNature(input.nature),
      object: input.object,
      financing: input.financing,
      accounts: input.accounts,
      plannedLaunchDate: input.plannedLaunchDate,
      plannedBidOpeningDate: input.plannedBidOpeningDate,
      plannedAwardDate: input.plannedAwardDate,
      beneficiaries: input.beneficiaries.map(({ service, amount }) => ({
        service,
        amount: ariary(amount)
      })),
      method: input.method === null ? null : parseProcedureMethod(input.method),
      procedureLead: input.procedureLead
    })

    const updated = input.lineId === null ? addPpmLine(ppm, line) : replacePpmLine(ppm, line)
    ppms.save(updated)
    return toDetailView(updated)
  }
}
