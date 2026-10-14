import { useEffect, useState, type SyntheticEvent } from 'react'
import type { PpmSummaryDto } from '@shared/api'
import { messageOf, unwrap } from '../../api-errors'
import { formatAriary, formatDate } from '../../format'
import { Alert } from '../../ui/Alert'
import { EmptyState } from '../../ui/EmptyState'
import { Icon } from '../../ui/Icon'
import { PageHeader } from '../../ui/PageHeader'

interface Props {
  readonly onOpen: (ppmId: string) => void
}

function todayIso(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

export function PpmListScreen({ onOpen }: Props): React.JSX.Element {
  const [ppms, setPpms] = useState<readonly PpmSummaryDto[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [elaboratedOn, setElaboratedOn] = useState(todayIso())
  const [pending, setPending] = useState(false)

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

  async function create(event: SyntheticEvent): Promise<void> {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      const created = unwrap(
        await window.api.createPpm({
          year: Number(year),
          elaboratedOn: elaboratedOn === '' ? null : elaboratedOn
        })
      )
      onOpen(created.id)
    } catch (failure) {
      setError(messageOf(failure))
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Plans de passation"
        description="Un plan par exercice : les marchés prévus, leurs dates et leurs montants."
      />

      {ppms === null && !error && <p role="status">Chargement…</p>}

      {ppms?.length === 0 && (
        <section className="panel panel--flush">
          <EmptyState icon="list" title="Aucun plan de passation pour cette région.">
            Créez le plan de l’année ci-dessous pour commencer le suivi.
          </EmptyState>
        </section>
      )}

      {ppms !== null && ppms.length > 0 && (
        <section className="panel panel--flush">
          <div className="table-wrap">
            <table>
              <caption className="visually-hidden">Plans de passation de la région</caption>
              <thead>
                <tr>
                  <th scope="col">N°</th>
                  <th scope="col">Année</th>
                  <th scope="col">Élaboré le</th>
                  <th scope="col">Dernière mise à jour</th>
                  <th scope="col" className="number">
                    Lignes
                  </th>
                  <th scope="col" className="number">
                    Montant total
                  </th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {ppms.map((ppm) => (
                  <tr key={ppm.id}>
                    <td>{ppm.number}</td>
                    <td>{ppm.year}</td>
                    <td>{formatDate(ppm.elaboratedOn)}</td>
                    <td>
                      {ppm.updateCount === 0
                        ? '—'
                        : `${formatDate(ppm.lastUpdateOn)} (mise à jour n° ${ppm.updateCount})`}
                    </td>
                    <td className="number">{ppm.lineCount}</td>
                    <td className="number">{formatAriary(ppm.total)}</td>
                    <td className="number">
                      <button
                        type="button"
                        className="secondary small"
                        aria-label={`Ouvrir le plan n° ${ppm.number} de ${ppm.year}`}
                        onClick={() => {
                          onOpen(ppm.id)
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
      )}

      <form className="panel" onSubmit={(event) => void create(event)}>
        <h2 className="panel__title">Nouveau plan de passation</h2>
        <div className="form-row">
          <div>
            <label htmlFor="ppm-year">Année</label>
            <input
              id="ppm-year"
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={(event) => {
                setYear(event.target.value)
              }}
              required
            />
          </div>
          <div>
            <label htmlFor="ppm-date">Date d’élaboration</label>
            <input
              id="ppm-date"
              type="date"
              value={elaboratedOn}
              onChange={(event) => {
                setElaboratedOn(event.target.value)
              }}
            />
          </div>
        </div>
        <p className="hint">Le numéro du plan est attribué automatiquement.</p>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="actions" style={{ marginTop: '1.25rem' }}>
          <button type="submit" disabled={pending || year === ''}>
            <Icon name="plus" size={16} />
            {pending ? 'Création…' : 'Créer le plan'}
          </button>
        </div>
      </form>
    </>
  )
}
