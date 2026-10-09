import type { RegionSummary } from '@domain/region'
import type { RegionSession } from '../region-session'

/** Se déconnecte de la région active (ferme sa base). */
export class CloseRegionUseCase {
  constructor(private readonly session: RegionSession) {}

  execute(): void {
    this.session.close()
  }
}

/** Indique quelle région est ouverte, s'il y en a une. */
export class GetSessionUseCase {
  constructor(private readonly session: RegionSession) {}

  execute(): RegionSummary | null {
    return this.session.current()
  }
}
