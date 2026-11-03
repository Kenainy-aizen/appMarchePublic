import { useEffect, useState, type SyntheticEvent } from 'react'
import type { ContractDetailDto } from '@shared/api'
import {
  CONTRACT_EVENT_LABELS,
  CONTRACT_KIND_LABELS,
  CONTRACT_STATUS_LABELS,
  type ContractEventCode,
  type ContractKindCode,
  type ContractStatusCode
} from '@shared/contract-options'
import { messageOf, unwrap } from '../../api-errors'
import { emptyToNull, formatAriary, formatDate, parseSignedAmount } from '../../format'
import { Alert } from '../../ui/Alert'
import { Icon } from '../../ui/Icon'
import { PageHeader } from '../../ui/PageHeader'

interface Props {
  readonly contractId: string
  readonly onEdit: (contract: ContractDetailDto) => void
  readonly onBack: () => void
}

const eventLabel = (kind: string): string => CONTRACT_EVENT_LABELS[kind as ContractEventCode]

function todayIso(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

const formatDelta = (delta: number): string =>
  `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${formatAriary(Math.abs(delta))}`

export function ContractDetailScreen({ contractId, onEdit, onBack }: Props): React.JSX.Element {
  const [detail, setDetail] = useState<ContractDetailDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [kind, setKind] = useState('')
  const [occurredOn, setOccurredOn] = useState(todayIso())
  const [delta, setDelta] = useState('')
  const [note, setNote] = useState('')
  const [confirmUndo, setConfirmUndo] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    const alive = { current: true }
    void (async () => {
      try {
        const loaded = unwrap(await window.api.getContract({ contractId }))
        if (alive.current) setDetail(loaded)
      } catch (failure) {
        if (alive.current) setError(messageOf(failure))
      }
    })()
    return () => {
      alive.current = false
    }
  }, [contractId])

  const allowed = detail?.allowedEvents ?? []
  // Le type choisi doit toujours faire partie des types autorisés à l'étape actuelle.
  const selectedKind = allowed.includes(kind) ? kind : (allowed[0] ?? '')

  async function run(action: () => Promise<ContractDetailDto | null>): Promise<boolean> {
    setBusy(true)
    setError(null)
    try {
      const updated = await action()
      if (updated) setDetail(updated)
      return true
    } catch (failure) {
      setError(messageOf(failure))
      return false
    } finally {
      setBusy(false)
      setConfirmUndo(false)
      setConfirmDelete(false)
    }
  }

  async function addEvent(event: SyntheticEvent): Promise<void> {
    event.preventDefault()
    let amountDelta: number | null = null
    if (selectedKind === 'AVENANT') {
      amountDelta = parseSignedAmount(delta)
      if (amountDelta === null) {
        setError(
          'La variation de montant est invalide : saisissez un nombre entier (par exemple 250 000 ou -50 000).'
        )
        return
      }
    }
    const done = await run(async () =>
      unwrap(
        await window.api.addContractEvent({
          contractId,
          kind: selectedKind as ContractEventCode,
          occurredOn,
          amountDelta,
          note: emptyToNull(note)
        })
      )
    )
    if (done) {
      setDelta('')
      setNote('')
      setKind('')
    }
  }

  const undoLast = (): Promise<boolean> =>
    run(async () => unwrap(await window.api.removeLastContractEvent({ contractId })))

  const remove = (): Promise<boolean> =>
    run(async () => {
      unwrap(await window.api.deleteContract({ contractId }))
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

  const lastEvent = detail.events.at(-1)

  return (
    <>
      <PageHeader
        title={`Contrat ${detail.reference}`}
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
          <dt>Type</dt>
          <dd>{CONTRACT_KIND_LABELS[detail.kind as ContractKindCode]}</dd>
        </div>
        <div>
          <dt>Titulaire</dt>
          <dd>{detail.holderName}</dd>
        </div>
        <div>
          <dt>Situation</dt>
          <dd>{CONTRACT_STATUS_LABELS[detail.status as ContractStatusCode]}</dd>
        </div>
        <div>
          <dt>Montant initial</dt>
          <dd>{formatAriary(detail.amount)}</dd>
        </div>
        <div>
          <dt>Montant actuel</dt>
          <dd>{formatAriary(detail.currentAmount)}</dd>
        </div>
        <div>
          <dt>Signature</dt>
          <dd>{formatDate(detail.signedOn)}</dd>
        </div>
        <div>
          <dt>Origine</dt>
          <dd>{detail.procedure ? `Procédure ${detail.procedure.reference}` : 'Sans procédure'}</dd>
        </div>
      </dl>

      {detail.signedOn === null && (
        <Alert tone="warning">
          Renseignez la date de signature (« Modifier l’en-tête ») pour pouvoir enregistrer les
          événements d’exécution.
        </Alert>
      )}
      {error && <Alert tone="error">{error}</Alert>}

      <section className="panel" aria-labelledby="exec-title">
        <h2 className="panel__title" id="exec-title">
          Exécution du contrat
        </h2>
        <p className="panel__lead">
          Ordres de service, réceptions, avenants et clôture, dans l’ordre où ils surviennent.
        </p>

        {detail.events.length === 0 ? (
          <p className="hint" style={{ marginTop: '1rem' }}>
            Aucun événement enregistré.
          </p>
        ) : (
          <div className="table-wrap" style={{ marginTop: '1rem' }}>
            <table>
              <caption className="visually-hidden">Événements d’exécution du contrat</caption>
              <thead>
                <tr>
                  <th scope="col">Événement</th>
                  <th scope="col">Date</th>
                  <th scope="col" className="number">
                    Variation du montant
                  </th>
                  <th scope="col">Note</th>
                </tr>
              </thead>
              <tbody>
                {detail.events.map((event) => (
                  <tr key={event.id}>
                    <td>
                      <strong>{eventLabel(event.kind)}</strong>
                    </td>
                    <td>{formatDate(event.occurredOn)}</td>
                    <td className="number">
                      {event.amountDelta === null ? '—' : formatDelta(event.amountDelta)}
                    </td>
                    <td>{event.note ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {lastEvent && (
          <div className="actions" style={{ marginTop: '1rem' }}>
            {confirmUndo ? (
              <>
                <button
                  type="button"
                  className="danger small"
                  disabled={busy}
                  onClick={() => void undoLast()}
                >
                  Confirmer l’annulation de « {eventLabel(lastEvent.kind)} »
                </button>
                <button
                  type="button"
                  className="secondary small"
                  onClick={() => {
                    setConfirmUndo(false)
                  }}
                >
                  Annuler
                </button>
              </>
            ) : (
              <button
                type="button"
                className="secondary small danger-outline"
                onClick={() => {
                  setConfirmUndo(true)
                }}
              >
                <Icon name="back" size={15} />
                Annuler le dernier événement
              </button>
            )}
          </div>
        )}

        {allowed.length > 0 ? (
          <form className="inline-form" onSubmit={(event) => void addEvent(event)}>
            <h3>Enregistrer un événement</h3>
            <div className="form-row">
              <div>
                <label htmlFor="ev-kind">Événement</label>
                <select
                  id="ev-kind"
                  value={selectedKind}
                  onChange={(event) => {
                    setKind(event.target.value)
                  }}
                >
                  {allowed.map((code) => (
                    <option key={code} value={code}>
                      {eventLabel(code)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="ev-date">Date</label>
                <input
                  id="ev-date"
                  type="date"
                  value={occurredOn}
                  onChange={(event) => {
                    setOccurredOn(event.target.value)
                  }}
                  required
                />
              </div>
              {selectedKind === 'AVENANT' && (
                <div>
                  <label htmlFor="ev-delta">Variation du montant (Ar)</label>
                  <input
                    id="ev-delta"
                    type="text"
                    inputMode="numeric"
                    value={delta}
                    onChange={(event) => {
                      setDelta(event.target.value)
                    }}
                    required
                  />
                </div>
              )}
            </div>
            <label htmlFor="ev-note">Note (facultative)</label>
            <input
              id="ev-note"
              type="text"
              value={note}
              maxLength={500}
              onChange={(event) => {
                setNote(event.target.value)
              }}
            />
            <div className="actions" style={{ marginTop: '1rem' }}>
              <button type="submit" disabled={busy}>
                <Icon name="plus" size={16} />
                Enregistrer l’événement
              </button>
            </div>
          </form>
        ) : (
          detail.signedOn !== null && (
            <Alert tone="info">
              Le contrat est clôturé : plus aucun événement ne peut être enregistré. Annulez le
              dernier événement pour le rouvrir.
            </Alert>
          )
        )}
      </section>

      <div className="danger-zone">
        {confirmDelete ? (
          <>
            <p>Le contrat sera supprimé définitivement.</p>
            <div className="actions">
              <button
                type="button"
                className="danger"
                disabled={busy}
                onClick={() => void remove()}
              >
                Confirmer la suppression du contrat
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
            <p>
              Un contrat ne se supprime que s’il n’a aucun événement d’exécution. Cette action est
              définitive.
            </p>
            <button
              type="button"
              className="secondary danger-outline"
              onClick={() => {
                setConfirmDelete(true)
              }}
            >
              <Icon name="trash" size={16} />
              Supprimer ce contrat
            </button>
          </>
        )}
      </div>
    </>
  )
}
