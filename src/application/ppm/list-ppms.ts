import type { RegionSession } from '../region-session'
import { type PpmSummaryView, toSummaryView } from './views'

/** Liste les plans de passation de la région ouverte, du plus récent au plus ancien. */
export class ListPpmsUseCase {
  constructor(private readonly session: RegionSession) {}

  execute(): readonly PpmSummaryView[] {
    return this.session.requireWorkspace().repositories.ppms.list().map(toSummaryView)
  }
}
