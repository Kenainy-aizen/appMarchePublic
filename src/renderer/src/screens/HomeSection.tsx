import { useEffect, useState } from 'react'
import type { PpmSummaryDto } from '@shared/api'
import { messageOf, unwrap } from '../api-errors'
import { formatAriary, formatDate } from '../format'
import type { SectionId } from '../layouts/AppShell'
import { Alert } from '../ui/Alert'
import { EmptyState } from '../ui/EmptyState'
import { Icon } from '../ui/Icon'
import { PageHeader } from '../ui/PageHeader'

interface Props {
  readonly regionName: string
  readonly organizationName: string | null
  readonly onNavigate: (section: SectionId) => void
}

/** Accueil : situation de la région ouverte, d'après ses plans de passation. */
export function HomeSection({
  regionName,
  organizationName,
  onNavigate
}: Props): React.JSX.Element {
  const [ppms, setPpms] = useState<readonly PpmSummaryDto[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const alive = { current: true }
    void (async () => {
      try {
        const list = unwrap(await window.api.listPpms())
        if (alive.current) setPpms(list)
      } catch (failure) {
        if (alive.current) setError(messageOf(failure))
      }
    })()
    return () => {
      alive.current = false
    }
  }, [])

  const lineCount = ppms?.reduce((sum, ppm) => sum + ppm.lineCount, 0) ?? 0
  const total = ppms?.reduce((sum, ppm) => sum + ppm.total, 0) ?? 0
  const lastUpdate =
    ppms
      ?.map((ppm) => ppm.lastUpdateOn)
      .filter((date): date is string => date !== null)
      .sort()
      .at(-1) ?? null

  return (
    <>
      <PageHeader
        title="Accueil"
        description={`Situation de la région ${regionName}. Seules les données de cette région sont ouvertes.`}
      />

      {organizationName === null && (
        <Alert tone="warning">
          <p>Le nom de la PRMP n’est pas renseigné. Il s’affichera en haut de l’application.</p>
          <div className="alert__action">
            <button
              type="button"
              className="secondary small"
              onClick={() => {
                onNavigate('settings')
              }}
            >
              Renseigner le nom de la PRMP
            </button>
          </div>
        </Alert>
      )}

      {error && <Alert tone="error">{error}</Alert>}

      {ppms === null && !error && <p role="status">Chargement…</p>}

      {ppms?.length === 0 && (
        <section className="panel panel--flush">
          <EmptyState
            icon="list"
            title="Aucun plan de passation dans cette région"
            action={
              <button
                type="button"
                onClick={() => {
                  onNavigate('ppm')
                }}
              >
                <Icon name="plus" size={16} />
                Créer un plan
              </button>
            }
          >
            Créez le plan de l’année pour commencer à suivre les marchés prévus, leurs dates et
            leurs montants.
          </EmptyState>
        </section>
      )}

      {ppms !== null && ppms.length > 0 && (
        <section className="panel" aria-labelledby="situation">
          <h2 className="panel__title" id="situation">
            Plans de passation
          </h2>
          <dl className="ledger">
            <div>
              <dt>Plans enregistrés</dt>
              <dd>{ppms.length}</dd>
            </div>
            <div>
              <dt>Lignes prévues</dt>
              <dd>{lineCount}</dd>
            </div>
            <div>
              <dt>Montant total prévu</dt>
              <dd>{formatAriary(total)}</dd>
            </div>
            <div>
              <dt>Dernière mise à jour</dt>
              <dd>{formatDate(lastUpdate)}</dd>
            </div>
          </dl>
          <div className="actions">
            <button
              type="button"
              onClick={() => {
                onNavigate('ppm')
              }}
            >
              Voir les plans
            </button>
          </div>
        </section>
      )}
    </>
  )
}
