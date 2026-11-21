import type { AlertDto, AlertsDto } from '@shared/api'
import { formatDate } from '../format'
import { Alert } from '../ui/Alert'
import { EmptyState } from '../ui/EmptyState'
import { PageHeader } from '../ui/PageHeader'

interface Props {
  readonly alerts: AlertsDto | null
  readonly error: string | null
  readonly onOpen: (target: AlertDto['target']) => void
  readonly onOpenSettings: () => void
}

const KIND_LABELS: Readonly<Record<string, string>> = {
  PROCEDURE_STEP: 'Étape de procédure',
  PPM_LINE_LAUNCH: 'Lancement prévu au plan',
  CONTRACT_NOT_STARTED: 'Marché non démarré'
}

const plural = (count: number, one: string, many: string): string =>
  `${String(count)} ${count > 1 ? many : one}`

/** « En retard de 5 jours », « Aujourd’hui », « Demain », « Dans 5 jours ». */
export function describeDue(daysLeft: number): string {
  if (daysLeft < 0) return `En retard de ${plural(-daysLeft, 'jour', 'jours')}`
  if (daysLeft === 0) return 'Aujourd’hui'
  if (daysLeft === 1) return 'Demain'
  return `Dans ${plural(daysLeft, 'jour', 'jours')}`
}

/** Échéances à surveiller : dépassées d'abord, puis celles des prochains jours (recalculées à chaque affichage). */
export function AlertsScreen({ alerts, error, onOpen, onOpenSettings }: Props): React.JSX.Element {
  const horizonLabel = alerts === null ? '' : plural(alerts.horizonDays, 'jour', 'jours')

  const renderGroup = (
    title: string,
    items: readonly AlertDto[],
    id: string
  ): React.JSX.Element => (
    <section className="panel panel--flush" aria-labelledby={id}>
      <h2 className="panel__title panel__title--padded" id={id}>
        {title} ({items.length})
      </h2>
      <div className="table-wrap">
        <table>
          <caption className="visually-hidden">{title}</caption>
          <thead>
            <tr>
              <th scope="col">Échéance</th>
              <th scope="col">Élément</th>
              <th scope="col">À faire</th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((alert) => (
              <tr
                key={alert.key}
                className={alert.severity === 'OVERDUE' ? 'is-overdue' : undefined}
              >
                <td>
                  <strong>{describeDue(alert.daysLeft)}</strong>
                  <div className="cell-note">{formatDate(alert.dueOn)}</div>
                </td>
                <td>
                  {alert.subject}
                  <div className="cell-note">{KIND_LABELS[alert.kind] ?? alert.kind}</div>
                </td>
                <td>{alert.action}</td>
                <td className="number">
                  <button
                    type="button"
                    className="secondary small"
                    aria-label={`Ouvrir ${alert.subject} : ${alert.action}`}
                    onClick={() => {
                      onOpen(alert.target)
                    }}
                  >
                    Ouvrir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )

  const overdue = alerts?.items.filter((alert) => alert.severity === 'OVERDUE') ?? []
  const upcoming = alerts?.items.filter((alert) => alert.severity === 'UPCOMING') ?? []

  return (
    <>
      <PageHeader
        title="Alertes d’échéances"
        description={
          alerts === null
            ? 'Échéances dépassées et échéances proches de cette région.'
            : `Échéances dépassées, et échéances des ${horizonLabel} à venir. Le délai se règle dans les Paramètres.`
        }
        actions={
          <button type="button" className="secondary" onClick={onOpenSettings}>
            Régler le délai
          </button>
        }
      />

      {error && <Alert tone="error">{error}</Alert>}
      {alerts === null && !error && <p role="status">Chargement…</p>}

      {alerts?.items.length === 0 && (
        <section className="panel panel--flush">
          <EmptyState icon="bell" title="Aucune échéance à surveiller">
            Aucune échéance dépassée, et rien à signaler dans les {horizonLabel} à venir. Les
            alertes se calculent à partir des dates prévues des étapes des procédures, des dates de
            lancement du plan de passation et de la date de signature des marchés.
          </EmptyState>
        </section>
      )}

      {overdue.length > 0 && renderGroup('En retard', overdue, 'alerts-overdue')}
      {upcoming.length > 0 && renderGroup('À venir', upcoming, 'alerts-upcoming')}
    </>
  )
}
