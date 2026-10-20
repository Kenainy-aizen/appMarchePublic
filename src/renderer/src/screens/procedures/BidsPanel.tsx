import { useEffect, useState, type SyntheticEvent } from 'react'
import type { CandidateDto, ProcedureDetailDto } from '@shared/api'
import { messageOf, unwrap } from '../../api-errors'
import { formatAmount, formatAriary, parseAmount } from '../../format'
import { Alert } from '../../ui/Alert'
import { Icon } from '../../ui/Icon'

interface Props {
  readonly detail: ProcedureDetailDto
  readonly onChange: (detail: ProcedureDetailDto) => void
}

const INVALID_AMOUNT =
  'Le montant de l’offre est invalide : saisissez un nombre entier (par exemple 1 500 000).'

/** Offres reçues pour une procédure : saisie, montant, désignation de l'offre retenue. */
export function BidsPanel({ detail, onChange }: Props): React.JSX.Element {
  const [candidates, setCandidates] = useState<readonly CandidateDto[]>([])
  const [candidateId, setCandidateId] = useState('')
  const [amount, setAmount] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [confirming, setConfirming] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const alive = { current: true }
    void (async () => {
      try {
        const list = unwrap(await window.api.listCandidates())
        if (alive.current) setCandidates(list)
      } catch (failure) {
        if (alive.current) setError(messageOf(failure))
      }
    })()
    return () => {
      alive.current = false
    }
  }, [])

  const biddingIds = new Set(detail.bids.map((bid) => bid.candidateId))
  const available = candidates.filter((candidate) => !biddingIds.has(candidate.id))
  const locked = detail.bidsLocked

  async function run(action: () => Promise<ProcedureDetailDto>): Promise<boolean> {
    setBusy(true)
    setError(null)
    try {
      onChange(await action())
      setEditing(null)
      setConfirming(null)
      return true
    } catch (failure) {
      setError(messageOf(failure))
      setConfirming(null)
      return false
    } finally {
      setBusy(false)
    }
  }

  async function add(event: SyntheticEvent): Promise<void> {
    event.preventDefault()
    const parsed = parseAmount(amount)
    if (parsed === null) {
      setError(INVALID_AMOUNT)
      return
    }
    const done = await run(async () =>
      unwrap(await window.api.addBid({ procedureId: detail.id, candidateId, amount: parsed }))
    )
    if (done) {
      setCandidateId('')
      setAmount('')
    }
  }

  async function saveAmount(bidId: string): Promise<void> {
    const parsed = parseAmount(editAmount)
    if (parsed === null) {
      setError(INVALID_AMOUNT)
      return
    }
    await run(async () =>
      unwrap(await window.api.updateBid({ procedureId: detail.id, bidId, amount: parsed }))
    )
  }

  const award = (bidId: string | null): Promise<boolean> =>
    run(async () => unwrap(await window.api.setAward({ procedureId: detail.id, bidId })))

  const remove = (bidId: string): Promise<boolean> =>
    run(async () => unwrap(await window.api.removeBid({ procedureId: detail.id, bidId })))

  return (
    <section className="panel" aria-labelledby="bids-title">
      <h2 className="panel__title" id="bids-title">
        Offres reçues
      </h2>
      <p className="panel__lead">
        L’attribution ne peut être validée que lorsqu’une offre est retenue.
      </p>

      {locked && (
        <Alert tone="info">
          L’attribution est validée : les offres ne peuvent plus être modifiées. Rouvrez
          l’attribution pour les modifier.
        </Alert>
      )}
      {error && <Alert tone="error">{error}</Alert>}

      {detail.bids.length === 0 ? (
        <p className="hint" style={{ marginTop: '1rem' }}>
          Aucune offre enregistrée pour cette procédure.
        </p>
      ) : (
        <div className="table-wrap" style={{ marginTop: '1rem' }}>
          <table>
            <caption className="visually-hidden">Offres reçues pour la procédure</caption>
            <thead>
              <tr>
                <th scope="col">Candidat</th>
                <th scope="col" className="number">
                  Montant de l’offre
                </th>
                <th scope="col">Statut</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {detail.bids.map((bid) => (
                <tr key={bid.id} className={bid.awarded ? 'is-next' : undefined}>
                  <td>
                    <strong>{bid.candidateName}</strong>
                  </td>
                  <td className="number">
                    {editing === bid.id ? (
                      <>
                        <label className="visually-hidden" htmlFor={`bid-amount-${bid.id}`}>
                          Nouveau montant de l’offre de {bid.candidateName}
                        </label>
                        <input
                          id={`bid-amount-${bid.id}`}
                          type="text"
                          inputMode="numeric"
                          value={editAmount}
                          onChange={(event) => {
                            setEditAmount(event.target.value)
                          }}
                        />
                      </>
                    ) : (
                      formatAriary(bid.amount)
                    )}
                  </td>
                  <td>
                    {bid.awarded ? (
                      <span className="badge badge--done">
                        <Icon name="check" size={14} />
                        Offre retenue
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <div className="row-actions row-actions--inline">
                      {editing === bid.id ? (
                        <>
                          <button
                            type="button"
                            className="small"
                            disabled={busy}
                            onClick={() => void saveAmount(bid.id)}
                          >
                            Enregistrer le montant
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
                        </>
                      ) : confirming === bid.id ? (
                        <>
                          <button
                            type="button"
                            className="danger small"
                            disabled={busy}
                            onClick={() => void remove(bid.id)}
                          >
                            Confirmer le retrait de l’offre de {bid.candidateName}
                          </button>
                          <button
                            type="button"
                            className="secondary small"
                            onClick={() => {
                              setConfirming(null)
                            }}
                          >
                            Annuler
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="small"
                            disabled={busy || locked}
                            aria-label={
                              bid.awarded
                                ? `Retirer la désignation de l’offre de ${bid.candidateName}`
                                : `Retenir l’offre de ${bid.candidateName}`
                            }
                            onClick={() => void award(bid.awarded ? null : bid.id)}
                          >
                            {bid.awarded ? 'Ne plus retenir' : 'Retenir'}
                          </button>
                          <button
                            type="button"
                            className="secondary small"
                            disabled={locked}
                            aria-label={`Modifier le montant de l’offre de ${bid.candidateName}`}
                            onClick={() => {
                              setEditing(bid.id)
                              setEditAmount(formatAmount(bid.amount))
                              setError(null)
                            }}
                          >
                            <Icon name="pencil" size={15} />
                            Montant
                          </button>
                          <button
                            type="button"
                            className="secondary small danger-outline"
                            disabled={locked}
                            aria-label={`Retirer l’offre de ${bid.candidateName}`}
                            onClick={() => {
                              setConfirming(bid.id)
                              setError(null)
                            }}
                          >
                            <Icon name="trash" size={15} />
                            Retirer
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!locked && (
        <form className="inline-form" onSubmit={(event) => void add(event)}>
          <h3>Ajouter une offre</h3>
          {available.length === 0 ? (
            <p className="hint">
              {candidates.length === 0
                ? 'Aucun candidat enregistré : créez-en dans le menu Candidats, puis revenez saisir son offre.'
                : 'Tous les candidats enregistrés ont déjà déposé une offre pour cette procédure.'}
            </p>
          ) : (
            <>
              <div className="form-row">
                <div>
                  <label htmlFor="bid-candidate">Candidat</label>
                  <select
                    id="bid-candidate"
                    value={candidateId}
                    onChange={(event) => {
                      setCandidateId(event.target.value)
                    }}
                    required
                  >
                    <option value="">Choisir un candidat…</option>
                    {available.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="bid-amount">Montant de l’offre (Ar)</label>
                  <input
                    id="bid-amount"
                    type="text"
                    inputMode="numeric"
                    value={amount}
                    onChange={(event) => {
                      setAmount(event.target.value)
                    }}
                    required
                  />
                </div>
              </div>
              <div className="actions" style={{ marginTop: '1rem' }}>
                <button type="submit" disabled={busy || candidateId === ''}>
                  <Icon name="plus" size={16} />
                  Ajouter l’offre
                </button>
              </div>
            </>
          )}
        </form>
      )}
    </section>
  )
}
