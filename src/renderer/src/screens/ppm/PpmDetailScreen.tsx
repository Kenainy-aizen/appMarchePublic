import { useEffect, useState } from 'react'
import type { PpmDetailDto, PpmLineDto } from '@shared/api'
import { METHOD_LABELS, NATURE_LABELS, type MethodCode, type NatureCode } from '@shared/ppm-options'
import { messageOf, unwrap } from '../../api-errors'
import { formatAriary, formatDate } from '../../format'
import { Alert } from '../../ui/Alert'
import { EmptyState } from '../../ui/EmptyState'
import { Icon } from '../../ui/Icon'
import { PageHeader } from '../../ui/PageHeader'

interface Props {
  readonly ppmId: string
  /** `line` = null pour une nouvelle ligne. */
  readonly onEditLine: (line: PpmLineDto | null) => void
  readonly onBack: () => void
}

type Confirmation = { readonly kind: 'plan' } | { readonly kind: 'line'; readonly lineId: string }

const natureLabel = (code: string): string => NATURE_LABELS[code as NatureCode]
const methodLabel = (code: string | null): string =>
  code === null ? '—' : METHOD_LABELS[code as MethodCode]

export function PpmDetailScreen({ ppmId, onEditLine, onBack }: Props): React.JSX.Element {
  const [detail, setDetail] = useState<PpmDetailDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const alive = { current: true }
    void (async () => {
      try {
        const loaded = unwrap(await window.api.getPpm({ ppmId }))
        if (alive.current) setDetail(loaded)
      } catch (failure) {
        if (alive.current) setError(messageOf(failure))
      }
    })()
    return () => {
      alive.current = false
    }
  }, [ppmId])

  /** Exécute une action, affiche son erreur éventuelle, et remplace le plan par la version renvoyée. */
  async function run(action: () => Promise<PpmDetailDto | null>): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const updated = await action()
      if (updated) setDetail(updated)
      setConfirmation(null)
    } catch (failure) {
      setError(messageOf(failure))
      setConfirmation(null)
    } finally {
      setBusy(false)
    }
  }

  const recordUpdate = (): Promise<void> =>
    run(async () => unwrap(await window.api.recordPpmUpdate({ ppmId })))

  const removeLine = (lineId: string): Promise<void> =>
    run(async () => unwrap(await window.api.removePpmLine({ ppmId, lineId })))

  const deletePlan = (): Promise<void> =>
    run(async () => {
      unwrap(await window.api.deletePpm({ ppmId }))
      onBack()
      return null
    })

  if (detail === null) {
    return (
      <>
        {error ? <Alert tone="error">{error}</Alert> : <p role="status">Chargement…</p>}
        <div className="actions" style={{ marginTop: '1.25rem' }}>
          <button type="button" className="secondary" onClick={onBack}>
            <Icon name="back" size={16} />
            Retour à la liste
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title={`Plan de passation n° ${detail.number} — ${detail.year}`}
        description={`Élaboré le ${formatDate(detail.elaboratedOn)}.`}
        actions={
          <>
            <button
              type="button"
              onClick={() => {
                onEditLine(null)
              }}
            >
              <Icon name="plus" size={16} />
              Ajouter une ligne
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => void recordUpdate()}
            >
              <Icon name="refresh" size={16} />
              Enregistrer une mise à jour
            </button>
            <button type="button" className="secondary" onClick={onBack}>
              <Icon name="back" size={16} />
              Retour à la liste
            </button>
          </>
        }
      />

      <dl className="ledger ledger--strip" style={{ marginTop: '1.5rem' }}>
        <div>
          <dt>Dernière mise à jour</dt>
          <dd>
            {detail.updateCount === 0
              ? 'Aucune'
              : `${formatDate(detail.lastUpdateOn)} (n° ${detail.updateCount})`}
          </dd>
        </div>
        <div>
          <dt>Lignes</dt>
          <dd>{detail.lineCount}</dd>
        </div>
        <div>
          <dt>Montant total</dt>
          <dd>{formatAriary(detail.total)}</dd>
        </div>
      </dl>

      {error && <Alert tone="error">{error}</Alert>}

      {detail.lines.length === 0 ? (
        <section className="panel panel--flush">
          <EmptyState icon="list" title="Ce plan ne contient encore aucune ligne.">
            Ajoutez une première ligne : un marché prévu, avec sa nature, ses dates et les montants
            par service.
          </EmptyState>
        </section>
      ) : (
        <section className="panel panel--flush">
          <div className="table-wrap">
            <table>
              <caption className="visually-hidden">Lignes du plan de passation</caption>
              <thead>
                <tr>
                  <th scope="col">Nature et mode</th>
                  <th scope="col">Objet</th>
                  <th scope="col" className="number">
                    Montant
                  </th>
                  <th scope="col">Dates prévisionnelles</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {detail.lines.map((line, index) => (
                  <tr key={line.id}>
                    <td>
                      {natureLabel(line.nature)}
                      {line.method && <div className="cell-note">{methodLabel(line.method)}</div>}
                    </td>
                    <td>
                      {line.object}
                      {line.financing && (
                        <div className="cell-note">Financement : {line.financing}</div>
                      )}
                      {line.beneficiaries.length > 0 && (
                        <div className="cell-note">
                          {line.beneficiaries.map((beneficiary) => beneficiary.service).join(', ')}
                        </div>
                      )}
                    </td>
                    <td className="number">{formatAriary(line.total)}</td>
                    <td>
                      <dl className="dates">
                        <div>
                          <dt>Lancement</dt>
                          <dd>{formatDate(line.plannedLaunchDate)}</dd>
                        </div>
                        <div>
                          <dt>Ouverture des plis</dt>
                          <dd>{formatDate(line.plannedBidOpeningDate)}</dd>
                        </div>
                        <div>
                          <dt>Attribution</dt>
                          <dd>{formatDate(line.plannedAwardDate)}</dd>
                        </div>
                      </dl>
                    </td>
                    <td>
                      <div className="row-actions">
                        {confirmation?.kind === 'line' && confirmation.lineId === line.id ? (
                          <>
                            <button
                              type="button"
                              className="danger small"
                              disabled={busy}
                              onClick={() => void removeLine(line.id)}
                            >
                              Confirmer la suppression de la ligne {index + 1}
                            </button>
                            <button
                              type="button"
                              className="secondary small"
                              onClick={() => {
                                setConfirmation(null)
                              }}
                            >
                              Annuler
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="secondary small"
                              aria-label={`Modifier la ligne ${index + 1}`}
                              onClick={() => {
                                onEditLine(line)
                              }}
                            >
                              <Icon name="pencil" size={15} />
                              Modifier
                            </button>
                            <button
                              type="button"
                              className="secondary small danger-outline"
                              aria-label={`Supprimer la ligne ${index + 1}`}
                              onClick={() => {
                                setConfirmation({ kind: 'line', lineId: line.id })
                              }}
                            >
                              <Icon name="trash" size={15} />
                              Supprimer
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" colSpan={2}>
                    Total du plan
                  </th>
                  <td className="number">{formatAriary(detail.total)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      <div className="danger-zone">
        {confirmation?.kind === 'plan' ? (
          <>
            <p>Le plan et toutes ses lignes seront supprimés définitivement.</p>
            <div className="actions">
              <button
                type="button"
                className="danger"
                disabled={busy}
                onClick={() => void deletePlan()}
              >
                Confirmer la suppression du plan
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setConfirmation(null)
                }}
              >
                Annuler
              </button>
            </div>
          </>
        ) : (
          <>
            <p>Supprimer ce plan retire aussi toutes ses lignes. Cette action est définitive.</p>
            <button
              type="button"
              className="secondary danger-outline"
              onClick={() => {
                setConfirmation({ kind: 'plan' })
              }}
            >
              <Icon name="trash" size={16} />
              Supprimer ce plan
            </button>
          </>
        )}
      </div>
    </>
  )
}
