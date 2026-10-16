import { useEffect, useState } from 'react'
import type { ProcedureDetailDto, ProcedureStepDto } from '@shared/api'
import { METHOD_LABELS, type MethodCode } from '@shared/ppm-options'
import { STEP_LABELS, type StepCode } from '@shared/procedure-options'
import { messageOf, unwrap } from '../../api-errors'
import { emptyToNull, formatAriary, formatDate } from '../../format'
import { Alert } from '../../ui/Alert'
import { Icon } from '../../ui/Icon'
import { PageHeader } from '../../ui/PageHeader'
import { ProgressBadge } from '../../ui/ProgressBadge'

interface Props {
  readonly procedureId: string
  readonly onEdit: (procedure: ProcedureDetailDto) => void
  readonly onBack: () => void
}

const label = (kind: string): string => STEP_LABELS[kind as StepCode]

export function ProcedureDetailScreen({ procedureId, onEdit, onBack }: Props): React.JSX.Element {
  const [detail, setDetail] = useState<ProcedureDetailDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [planned, setPlanned] = useState('')
  const [actual, setActual] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    const alive = { current: true }
    void (async () => {
      try {
        const loaded = unwrap(await window.api.getProcedure({ procedureId }))
        if (alive.current) setDetail(loaded)
      } catch (failure) {
        if (alive.current) setError(messageOf(failure))
      }
    })()
    return () => {
      alive.current = false
    }
  }, [procedureId])

  async function run(action: () => Promise<ProcedureDetailDto | null>): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const updated = await action()
      if (updated) setDetail(updated)
      setEditing(null)
    } catch (failure) {
      setError(messageOf(failure))
    } finally {
      setBusy(false)
      setConfirmDelete(false)
    }
  }

  function startEditing(step: ProcedureStepDto): void {
    setEditing(step.kind)
    setPlanned(step.plannedDate ?? '')
    setActual(step.actualDate ?? '')
    setError(null)
  }

  const saveDates = (kind: string): Promise<void> =>
    run(async () =>
      unwrap(
        await window.api.saveStepDates({
          procedureId,
          step: kind as StepCode,
          plannedDate: emptyToNull(planned),
          actualDate: emptyToNull(actual)
        })
      )
    )

  const validate = (kind: string): Promise<void> =>
    run(async () => unwrap(await window.api.validateStep({ procedureId, step: kind as StepCode })))

  const reopen = (kind: string): Promise<void> =>
    run(async () => unwrap(await window.api.reopenStep({ procedureId, step: kind as StepCode })))

  const remove = (): Promise<void> =>
    run(async () => {
      unwrap(await window.api.deleteProcedure({ procedureId }))
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
        title={`Procédure ${detail.reference}`}
        description={detail.object}
        actions={
          <>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                onEdit(detail)
              }}
            >
              <Icon name="pencil" size={16} />
              Modifier l’en-tête
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
          <dt>Mode de passation</dt>
          <dd>{METHOD_LABELS[detail.method as MethodCode]}</dd>
        </div>
        <div>
          <dt>Avancement</dt>
          <dd>
            <ProgressBadge
              status={detail.status}
              validatedCount={detail.validatedCount}
              totalSteps={detail.totalSteps}
            />
          </dd>
        </div>
        <div>
          <dt>Montant estimé</dt>
          <dd>{detail.estimatedAmount === null ? '—' : formatAriary(detail.estimatedAmount)}</dd>
        </div>
        <div>
          <dt>Ligne du plan</dt>
          <dd>
            {detail.ppmLine
              ? `Plan n° ${detail.ppmLine.ppmNumber} (${detail.ppmLine.ppmYear}) : ${detail.ppmLine.object}`
              : 'Hors plan'}
          </dd>
        </div>
      </dl>

      {error && <Alert tone="error">{error}</Alert>}

      <section className="panel panel--flush">
        <div className="table-wrap">
          <table>
            <caption className="visually-hidden">Étapes de la procédure</caption>
            <thead>
              <tr>
                <th scope="col">Étape</th>
                <th scope="col">Date prévue</th>
                <th scope="col">Date réelle</th>
                <th scope="col">Validation</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {detail.steps.map((step, index) => {
                const previous = detail.steps[index - 1]
                const next = detail.steps[index + 1]
                const isValidated = step.validatedOn !== null
                const isNext = detail.nextStep === step.kind
                const canValidate =
                  !isValidated && (previous === undefined || previous.validatedOn !== null)
                const canReopen = isValidated && (next === undefined || next.validatedOn === null)
                const stepLabel = label(step.kind)

                return (
                  <tr key={step.kind} className={isNext ? 'is-next' : undefined}>
                    <td>
                      <strong>{stepLabel}</strong>
                      {isNext && <div className="cell-note">Prochaine étape à valider</div>}
                    </td>

                    {editing === step.kind ? (
                      <>
                        <td>
                          <label className="visually-hidden" htmlFor={`planned-${step.kind}`}>
                            Date prévue de {stepLabel}
                          </label>
                          <input
                            id={`planned-${step.kind}`}
                            type="date"
                            value={planned}
                            onChange={(event) => {
                              setPlanned(event.target.value)
                            }}
                          />
                        </td>
                        <td>
                          <label className="visually-hidden" htmlFor={`actual-${step.kind}`}>
                            Date réelle de {stepLabel}
                          </label>
                          <input
                            id={`actual-${step.kind}`}
                            type="date"
                            value={actual}
                            onChange={(event) => {
                              setActual(event.target.value)
                            }}
                          />
                        </td>
                        <td>—</td>
                        <td>
                          <div className="row-actions row-actions--inline">
                            <button
                              type="button"
                              className="small"
                              disabled={busy}
                              onClick={() => void saveDates(step.kind)}
                            >
                              Enregistrer les dates
                            </button>
                            <button
                              type="button"
                              className="secondary small"
                              onClick={() => {
                                setEditing(null)
                              }}
                            >
                              Annuler
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td>{formatDate(step.plannedDate)}</td>
                        <td>{formatDate(step.actualDate)}</td>
                        <td>
                          {isValidated ? (
                            <span className="badge badge--done">
                              <Icon name="check" size={14} />
                              Validée le {formatDate(step.validatedOn)}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          <div className="row-actions row-actions--inline">
                            {isValidated ? (
                              <button
                                type="button"
                                className="secondary small"
                                aria-label={`Rouvrir l’étape ${stepLabel}`}
                                disabled={busy || !canReopen}
                                title={
                                  canReopen
                                    ? undefined
                                    : 'Rouvrez d’abord l’étape suivante, validée après celle-ci.'
                                }
                                onClick={() => void reopen(step.kind)}
                              >
                                Rouvrir
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className="secondary small"
                                  aria-label={`Modifier les dates de ${stepLabel}`}
                                  onClick={() => {
                                    startEditing(step)
                                  }}
                                >
                                  <Icon name="pencil" size={15} />
                                  Dates
                                </button>
                                <button
                                  type="button"
                                  className="small"
                                  aria-label={`Valider l’étape ${stepLabel}`}
                                  disabled={busy || !canValidate}
                                  title={
                                    canValidate
                                      ? 'La validation est enregistrée à la date du jour.'
                                      : 'Validez d’abord l’étape précédente.'
                                  }
                                  onClick={() => void validate(step.kind)}
                                >
                                  <Icon name="check" size={15} />
                                  Valider
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="danger-zone">
        {confirmDelete ? (
          <>
            <p>La procédure et ses étapes seront supprimées définitivement.</p>
            <div className="actions">
              <button
                type="button"
                className="danger"
                disabled={busy}
                onClick={() => void remove()}
              >
                Confirmer la suppression de la procédure
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setConfirmDelete(false)
                }}
              >
                Annuler
              </button>
            </div>
          </>
        ) : (
          <>
            <p>Supprimer cette procédure retire aussi ses étapes. Cette action est définitive.</p>
            <button
              type="button"
              className="secondary danger-outline"
              onClick={() => {
                setConfirmDelete(true)
              }}
            >
              <Icon name="trash" size={16} />
              Supprimer cette procédure
            </button>
          </>
        )}
      </div>
    </>
  )
}
