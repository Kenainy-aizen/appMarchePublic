import { useEffect, useState, type SyntheticEvent } from 'react'
import type { PpmLineChoiceDto, ProcedureDetailDto } from '@shared/api'
import { METHOD_CODES, METHOD_LABELS } from '@shared/ppm-options'
import { messageOf, unwrap } from '../../api-errors'
import { formatAmount, formatAriary, parseAmount } from '../../format'
import { Alert } from '../../ui/Alert'
import { Icon } from '../../ui/Icon'
import { PageHeader } from '../../ui/PageHeader'

interface Props {
  /** null = nouvelle procédure ; sinon modification de l'en-tête. */
  readonly procedure: ProcedureDetailDto | null
  readonly onSaved: (procedureId: string) => void
  readonly onCancel: () => void
}

const lineLabel = (line: PpmLineChoiceDto): string =>
  `Plan n° ${line.ppmNumber} (${line.ppmYear}) : ${line.object} — ${formatAriary(line.total)}`

export function ProcedureForm({ procedure, onSaved, onCancel }: Props): React.JSX.Element {
  const editing = procedure !== null
  const methodLocked = editing && procedure.validatedCount > 0

  const [lines, setLines] = useState<readonly PpmLineChoiceDto[]>([])
  const [reference, setReference] = useState(procedure?.reference ?? '')
  const [object, setObject] = useState(procedure?.object ?? '')
  const [method, setMethod] = useState(procedure?.method ?? 'DAO')
  const [methodTouched, setMethodTouched] = useState(false)
  const [lineId, setLineId] = useState(procedure?.ppmLine?.lineId ?? '')
  const [estimate, setEstimate] = useState(
    procedure?.estimatedAmount == null ? '' : formatAmount(procedure.estimatedAmount)
  )
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    const alive = { current: true }
    void (async () => {
      try {
        const choices = unwrap(await window.api.listPpmLines())
        if (alive.current) setLines(choices)
      } catch (failure) {
        if (alive.current) setError(messageOf(failure))
      }
    })()
    return () => {
      alive.current = false
    }
  }, [])

  /** Choisir une ligne du plan préremplit les champs encore vides (jamais ce que l'on a déjà saisi). */
  function chooseLine(id: string): void {
    setLineId(id)
    const line = lines.find((candidate) => candidate.lineId === id)
    if (!line || editing) return
    if (object.trim() === '') setObject(line.object)
    if (estimate.trim() === '' && line.total > 0) setEstimate(formatAmount(line.total))
    if (!methodTouched && line.method !== null) setMethod(line.method)
  }

  async function submit(event: SyntheticEvent): Promise<void> {
    event.preventDefault()
    const estimatedAmount = estimate.trim() === '' ? null : parseAmount(estimate)
    if (estimate.trim() !== '' && estimatedAmount === null) {
      setError(
        'Le montant estimé est invalide : saisissez un nombre entier (par exemple 1 500 000).'
      )
      return
    }
    setPending(true)
    setError(null)
    try {
      const fields = {
        reference,
        object,
        method: method as (typeof METHOD_CODES)[number],
        ppmLineId: lineId === '' ? null : lineId,
        estimatedAmount
      }
      const saved = unwrap(
        procedure
          ? await window.api.updateProcedure({ ...fields, procedureId: procedure.id })
          : await window.api.createProcedure(fields)
      )
      onSaved(saved.id)
    } catch (failure) {
      setError(messageOf(failure))
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <PageHeader
        title={editing ? 'Modifier la procédure' : 'Nouvelle procédure'}
        description="La référence est unique dans la région. Les cinq étapes sont créées automatiquement."
      />

      <form className="panel" onSubmit={(event) => void submit(event)}>
        <div className="form-row">
          <div>
            <label htmlFor="proc-reference">Référence</label>
            <input
              id="proc-reference"
              type="text"
              value={reference}
              maxLength={100}
              onChange={(event) => {
                setReference(event.target.value)
              }}
              required
            />
          </div>
          <div>
            <label htmlFor="proc-method">Mode de passation</label>
            <select
              id="proc-method"
              value={method}
              disabled={methodLocked}
              onChange={(event) => {
                setMethod(event.target.value)
                setMethodTouched(true)
              }}
            >
              {METHOD_CODES.map((code) => (
                <option key={code} value={code}>
                  {METHOD_LABELS[code]}
                </option>
              ))}
            </select>
            {methodLocked && (
              <p className="hint">
                Le mode ne peut plus être modifié : une étape est déjà validée.
              </p>
            )}
          </div>
        </div>

        <label htmlFor="proc-line">Ligne du plan de passation</label>
        <select
          id="proc-line"
          value={lineId}
          onChange={(event) => {
            chooseLine(event.target.value)
          }}
        >
          <option value="">Aucune (procédure hors plan)</option>
          {lines.map((line) => (
            <option key={line.lineId} value={line.lineId}>
              {lineLabel(line)}
            </option>
          ))}
        </select>
        {!editing && (
          <p className="hint">
            Choisir une ligne préremplit l’objet, le mode et le montant estimé.
          </p>
        )}

        <label htmlFor="proc-object">Objet</label>
        <textarea
          id="proc-object"
          rows={3}
          value={object}
          onChange={(event) => {
            setObject(event.target.value)
          }}
          required
        />

        <div className="form-row">
          <div>
            <label htmlFor="proc-estimate">Montant estimé (Ar)</label>
            <input
              id="proc-estimate"
              type="text"
              inputMode="numeric"
              value={estimate}
              onChange={(event) => {
                setEstimate(event.target.value)
              }}
            />
          </div>
        </div>

        {error && <Alert tone="error">{error}</Alert>}

        <div className="actions" style={{ marginTop: '1.5rem' }}>
          <button type="submit" disabled={pending}>
            <Icon name="check" size={16} />
            {pending
              ? 'Enregistrement…'
              : editing
                ? 'Enregistrer les modifications'
                : 'Créer la procédure'}
          </button>
          <button type="button" className="secondary" onClick={onCancel}>
            Annuler
          </button>
        </div>
      </form>
    </>
  )
}
