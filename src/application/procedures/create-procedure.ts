import { createProcedure, parseProcedureMethod } from '@domain/procedure'
import { ariary } from '@domain/shared/ariary'
import type { Clock, IdGenerator } from '@domain/shared/ports'
import type { RegionSession } from '../region-session'
import { assertPpmLineExists, assertReferenceAvailable, detailOf, ppmsOf } from './procedure-access'
import type { ProcedureDetailView } from './views'

export interface ProcedureFields {
  readonly reference: string
  readonly object: string
  readonly method: string
  readonly ppmLineId: string | null
  readonly estimatedAmount: number | null
}

/** Crée une procédure : ses 5 étapes existent d'emblée, sans date. Référence unique dans la région. */
export class CreateProcedureUseCase {
  constructor(
    private readonly session: RegionSession,
    private readonly ids: IdGenerator,
    private readonly clock: Clock
  ) {}

  execute(input: ProcedureFields): ProcedureDetailView {
    const { repositories } = this.session.requireWorkspace()
    const ppms = ppmsOf(repositories)
    const procedure = createProcedure({
      id: this.ids.newId(),
      reference: input.reference,
      object: input.object,
      method: parseProcedureMethod(input.method),
      ppmLineId: input.ppmLineId,
      estimatedAmount: input.estimatedAmount === null ? null : ariary(input.estimatedAmount),
      createdOn: this.clock.today()
    })
    assertReferenceAvailable(repositories.procedures, procedure.reference, null)
    assertPpmLineExists(ppms, procedure.ppmLineId)
    repositories.procedures.save(procedure)
    return detailOf(repositories, procedure)
  }
}
