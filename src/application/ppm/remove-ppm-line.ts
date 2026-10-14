import { removePpmLine } from '@domain/ppm'
import type { RegionSession } from '../region-session'
import { assertLinesNotInUse, requirePpm } from './ppm-access'
import { type PpmDetailView, toDetailView } from './views'

/** Retire une ligne du plan, sauf si une procédure ou un contrat s'y rattache. */
export class RemovePpmLineUseCase {
  constructor(private readonly session: RegionSession) {}

  execute(input: { readonly ppmId: string; readonly lineId: string }): PpmDetailView {
    const { repositories } = this.session.requireWorkspace()
    const ppm = requirePpm(repositories.ppms, input.ppmId)
    const updated = removePpmLine(ppm, input.lineId) // vérifie aussi que la ligne existe
    assertLinesNotInUse(repositories, [input.lineId], 'line')
    repositories.ppms.save(updated)
    return toDetailView(updated)
  }
}
