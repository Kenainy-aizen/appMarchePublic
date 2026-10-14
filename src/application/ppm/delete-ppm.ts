import type { RegionSession } from '../region-session'
import { assertLinesNotInUse, requirePpm } from './ppm-access'

/** Supprime un plan et ses lignes, sauf si une procédure ou un contrat s'y rattache. */
export class DeletePpmUseCase {
  constructor(private readonly session: RegionSession) {}

  execute(input: { readonly ppmId: string }): void {
    const { repositories } = this.session.requireWorkspace()
    const ppm = requirePpm(repositories.ppms, input.ppmId)
    assertLinesNotInUse(
      repositories,
      ppm.lines.map((line) => line.id),
      'plan'
    )
    repositories.ppms.delete(ppm.id)
  }
}
