import { computeAlerts, countBySeverity, parseAlertHorizon } from '@domain/alerts'
import type { Clock } from '@domain/shared/ports'
import type { OrganizationSettings } from '../ports'
import type { RegionSession } from '../region-session'

export interface AlertView {
  readonly key: string
  readonly kind: string
  readonly severity: string
  readonly dueOn: string
  readonly daysLeft: number
  readonly subject: string
  readonly action: string
  readonly target: { readonly kind: string; readonly id: string }
}

export interface AlertsView {
  readonly today: string
  readonly horizonDays: number
  readonly overdueCount: number
  readonly upcomingCount: number
  readonly items: readonly AlertView[]
}

/** Échéances de la région ouverte (ADR-031) : recalculées à chaque appel à partir des données et de la date du jour. */
export class ListAlertsUseCase {
  constructor(
    private readonly session: RegionSession,
    private readonly settings: OrganizationSettings,
    private readonly clock: Clock
  ) {}

  execute(): AlertsView {
    const { repositories } = this.session.requireWorkspace()
    const today = this.clock.today()
    const horizonDays = this.settings.getAlertHorizonDays()
    const items = computeAlerts({
      today,
      horizonDays,
      procedures: repositories.procedures.list(),
      ppms: repositories.ppms.list(),
      contracts: repositories.contracts.list()
    })
    const counts = countBySeverity(items)
    return {
      today,
      horizonDays,
      overdueCount: counts.overdue,
      upcomingCount: counts.upcoming,
      items: items.map((alert) => ({
        key: alert.key,
        kind: alert.kind,
        severity: alert.severity,
        dueOn: alert.dueOn,
        daysLeft: alert.daysLeft,
        subject: alert.subject,
        action: alert.action,
        target: { kind: alert.target.kind, id: alert.target.id }
      }))
    }
  }
}

/** Change le délai d'alerte (réglage général, valable pour toutes les régions). */
export class SaveAlertHorizonUseCase {
  constructor(private readonly settings: OrganizationSettings) {}

  execute(input: { readonly days: number }): { readonly alertHorizonDays: number } {
    const days = parseAlertHorizon(input.days)
    this.settings.saveAlertHorizonDays(days)
    return { alertHorizonDays: days }
  }
}
