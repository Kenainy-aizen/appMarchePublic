import { parseProcedureMethod, updateProcedureDetails } from '@domain/procedure'
import { ariary } from '@domain/shared/ariary'
import type { RegionSession } from '../region-session'
import type { ProcedureFields } from './create-procedure'
import {
  assertPpmLineExists,
  assertReferenceAvailable,
  detailOf,
  ppmsOf,
  requireProcedure
} from './procedure-access'
import type { ProcedureDetailView } from './views'

/** Modifie l'en-tête d'une procédure (le mode n'est plus modifiable dès qu'une étape est validée). */
export class UpdateProcedureUseCase {
  constructor(private readonly session: RegionSession) {}

  execute(input: ProcedureFields & { readonly procedureId: string }): ProcedureDetailView {
    const { repositories } = this.session.requireWorkspace()
    const ppms = ppmsOf(repositories)
    const current = requireProcedure(repositories.procedures, input.procedureId)
    const updated = updateProcedureDetails(current, {
      reference: input.reference,
      object: input.object,
      method: parseProcedureMethod(input.method),
      ppmLineId: input.ppmLineId,
      estimatedAmount: input.estimatedAmount === null ? null : ariary(input.estimatedAmount)
    })
    assertReferenceAvailable(repositories.procedures, updated.reference, updated.id)
    assertPpmLineExists(ppms, updated.ppmLineId)
    repositories.procedures.save(updated)
    return detailOf(repositories, updated)
  }
}
