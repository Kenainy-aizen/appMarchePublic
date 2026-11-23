import type { DashboardDto } from '@shared/api'
import {
  CONTRACT_STATUS_CODES,
  CONTRACT_STATUS_LABELS,
  type ContractStatusCode
} from '@shared/contract-options'
import { METHOD_LABELS, type MethodCode } from '@shared/ppm-options'
import { formatAriary } from '../format'
import type { SectionId } from '../layouts/AppShell'

interface Props {
  readonly dashboard: DashboardDto
  readonly onNavigate: (section: SectionId) => void
}

/** « +150 000 Ar » / « −50 000 Ar » / « 0 Ar » : variation de montant avec son signe. */
const formatVariation = (amount: number): string =>
  `${amount > 0 ? '+' : amount < 0 ? '−' : ''}${formatAriary(Math.abs(amount))}`

function Stat({
  value,
  label
}: {
  readonly value: number
  readonly label: string
}): React.JSX.Element {
  return (
    <div className="stat">
      <div className="stat__value">{value}</div>
      <div className="stat__label">{label}</div>
    </div>
  )
}

/**
 * Indicateurs de la région, sous la situation des plans : réalisation du plan, procédures, contrats,
 * candidats et offres. Un bloc sans donnée n'est pas affiché. Tout est recalculé à chaque affichage.
 */
export function DashboardPanels({ dashboard, onNavigate }: Props): React.JSX.Element {
  const { plans, procedures, contracts, candidates } = dashboard
  const statuses = CONTRACT_STATUS_CODES.filter((code) => (contracts.byStatus[code] ?? 0) > 0)

  return (
    <>
      {plans.length > 0 && (
        <section className="panel panel--flush" aria-labelledby="dash-plans">
          <h2 className="panel__title panel__title--padded" id="dash-plans">
            Réalisation du plan
          </h2>
          <div className="table-wrap">
            <table>
              <caption className="visually-hidden">Réalisation de chaque plan de passation</caption>
              <thead>
                <tr>
                  <th scope="col">Plan</th>
                  <th scope="col">Lignes lancées</th>
                  <th scope="col" className="number">
                    Montant prévu
                  </th>
                  <th scope="col" className="number">
                    Montant contractualisé
                  </th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => {
                  const percent = plan.launchRatePercent
                  return (
                    <tr key={plan.planId}>
                      <td>
                        <strong>
                          Plan n° {plan.number} ({plan.year})
                        </strong>
                      </td>
                      <td>
                        {plan.launchedLineCount} sur {plan.lineCount} ({percent} %)
                        <div
                          className="bar"
                          role="img"
                          aria-label={`${String(percent)} % des lignes lancées`}
                        >
                          <span style={{ width: `${String(percent)}%` }} />
                        </div>
                      </td>
                      <td className="number">{formatAriary(plan.plannedAmount)}</td>
                      <td className="number">{formatAriary(plan.contractedAmount)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {procedures.total > 0 && (
        <section className="panel" aria-labelledby="dash-procedures">
          <h2 className="panel__title" id="dash-procedures">
            Procédures
          </h2>
          <div className="stats">
            <Stat value={procedures.total} label="Procédures" />
            <Stat value={procedures.notStarted} label="Non démarrées" />
            <Stat value={procedures.inProgress} label="En cours" />
            <Stat value={procedures.completed} label="Terminées" />
            <Stat value={procedures.awarded} label="Attribuées" />
          </div>
          <div className="table-wrap" style={{ marginTop: '1rem' }}>
            <table>
              <caption className="visually-hidden">Procédures par mode de passation</caption>
              <thead>
                <tr>
                  <th scope="col">Mode de passation</th>
                  <th scope="col" className="number">
                    Nombre
                  </th>
                  <th scope="col" className="number">
                    Montant estimé
                  </th>
                </tr>
              </thead>
              <tbody>
                {procedures.byMethod.map((figures) => (
                  <tr key={figures.method}>
                    <td>{METHOD_LABELS[figures.method as MethodCode]}</td>
                    <td className="number">{figures.count}</td>
                    <td className="number">{formatAriary(figures.estimatedAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="actions" style={{ marginTop: '1rem' }}>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                onNavigate('procedures')
              }}
            >
              Voir les procédures
            </button>
          </div>
        </section>
      )}

      {contracts.total > 0 && (
        <section className="panel" aria-labelledby="dash-contracts">
          <h2 className="panel__title" id="dash-contracts">
            Contrats
          </h2>
          <dl className="ledger">
            <div>
              <dt>Contrats</dt>
              <dd>{contracts.total}</dd>
            </div>
            <div>
              <dt>Montant initial</dt>
              <dd>{formatAriary(contracts.initialAmount)}</dd>
            </div>
            <div>
              <dt>Avenants</dt>
              <dd>{formatVariation(contracts.amendmentsAmount)}</dd>
            </div>
            <div>
              <dt>Montant actuel</dt>
              <dd>{formatAriary(contracts.currentAmount)}</dd>
            </div>
          </dl>
          <div className="table-wrap" style={{ marginTop: '1rem' }}>
            <table>
              <caption className="visually-hidden">Contrats par situation d’exécution</caption>
              <thead>
                <tr>
                  <th scope="col">Situation</th>
                  <th scope="col" className="number">
                    Nombre
                  </th>
                </tr>
              </thead>
              <tbody>
                {statuses.map((code: ContractStatusCode) => (
                  <tr key={code}>
                    <td>{CONTRACT_STATUS_LABELS[code]}</td>
                    <td className="number">{contracts.byStatus[code]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="actions" style={{ marginTop: '1rem' }}>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                onNavigate('contracts')
              }}
            >
              Voir les contrats
            </button>
          </div>
        </section>
      )}

      {(candidates.total > 0 || candidates.bids > 0) && (
        <section className="panel" aria-labelledby="dash-candidates">
          <h2 className="panel__title" id="dash-candidates">
            Candidats et offres
          </h2>
          <div className="stats">
            <Stat value={candidates.total} label="Candidats" />
            <Stat value={candidates.bids} label="Offres reçues" />
            <Stat value={candidates.awardedBids} label="Offres retenues" />
          </div>
          <div className="actions" style={{ marginTop: '1rem' }}>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                onNavigate('candidates')
              }}
            >
              Voir les candidats
            </button>
          </div>
        </section>
      )}
    </>
  )
}
