import { recordPpmUpdate } from '@domain/ppm'
import type { Clock } from '@domain/shared/ports'
import type { RegionSession } from '../region-session'
import { requirePpm } from './ppm-access'
import { type PpmDetailView, toDetailView } from './views'

/**
 * Enregistre une mise à jour du plan : la date du jour devient la « date de dernière mise à jour » et le
 * numéro de mise à jour augmente de 1. C'est une action volontaire de la PRMP, pas un effet automatique
 * de chaque modification (ADR-023).
 */
export class RecordPpmUpdateUseCase {
  constructor(
    private readonly session: RegionSession,
    private readonly clock: Clock
  ) {}

  execute(input: { readonly ppmId: string }): PpmDetailView {
    const { ppms } = this.session.requireWorkspace().repositories
    const updated = recordPpmUpdate(requirePpm(ppms, input.ppmId), this.clock.today())
    ppms.save(updated)
    return toDetailView(updated)
  }
}
