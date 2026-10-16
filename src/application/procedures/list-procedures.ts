import type { RegionSession } from '../region-session'
import {
  listLineChoices,
  toSummaryView,
  type PpmLineChoiceView,
  type ProcedureSummaryView
} from './views'

/** Procédures de la région ouverte, de la plus récente à la plus ancienne. */
export class ListProceduresUseCase {
  constructor(private readonly session: RegionSession) {}

  execute(): readonly ProcedureSummaryView[] {
    return this.session.requireWorkspace().repositories.procedures.list().map(toSummaryView)
  }
}

/** Lignes des plans de passation proposées pour le rattachement d'une procédure. */
export class ListPpmLinesUseCase {
  constructor(private readonly session: RegionSession) {}

  execute(): readonly PpmLineChoiceView[] {
    return listLineChoices(this.session.requireWorkspace().repositories.ppms.list())
  }
}
