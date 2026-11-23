import { computeDashboard, type Dashboard } from '@domain/dashboard'
import type { RegionSession } from '../region-session'

export type DashboardView = Dashboard

/** Indicateurs de la région ouverte (ADR-032) : recalculés à chaque appel, jamais enregistrés. */
export class GetDashboardUseCase {
  constructor(private readonly session: RegionSession) {}

  execute(): DashboardView {
    const { repositories } = this.session.requireWorkspace()
    return computeDashboard({
      ppms: repositories.ppms.list(),
      procedures: repositories.procedures.list(),
      contracts: repositories.contracts.list(),
      candidates: repositories.candidates.list()
    })
  }
}
