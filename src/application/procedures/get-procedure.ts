import type { RegionSession } from '../region-session'
import { ppmsOf, requireProcedure } from './procedure-access'
import { toDetailView, type ProcedureDetailView } from './views'

export class GetProcedureUseCase {
  constructor(private readonly session: RegionSession) {}

  execute(input: { readonly procedureId: string }): ProcedureDetailView {
    const { repositories } = this.session.requireWorkspace()
    return toDetailView(
      requireProcedure(repositories.procedures, input.procedureId),
      ppmsOf(repositories)
    )
  }
}
