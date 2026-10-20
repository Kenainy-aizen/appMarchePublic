import { useEffect, useState } from 'react'
import type { CandidateDto } from '@shared/api'
import { messageOf, unwrap } from '../../api-errors'
import { Alert } from '../../ui/Alert'
import { EmptyState } from '../../ui/EmptyState'
import { Icon } from '../../ui/Icon'
import { PageHeader } from '../../ui/PageHeader'

interface Props {
  readonly onCreate: () => void
  readonly onEdit: (candidate: CandidateDto) => void
}

export function CandidateListScreen({ onCreate, onEdit }: Props): React.JSX.Element {
  const [candidates, setCandidates] = useState<readonly CandidateDto[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
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

  async function remove(candidate: CandidateDto): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      unwrap(await window.api.deleteCandidate({ candidateId: candidate.id }))
      setCandidates((current) => current?.filter((item) => item.id !== candidate.id) ?? null)
    } catch (failure) {
      setError(messageOf(failure))
    } finally {
      setBusy(false)
      setConfirming(null)
    }
  }

  const createButton = (
    <button type="button" onClick={onCreate}>
      <Icon name="plus" size={16} />
      Nouveau candidat
    </button>
  )

  return (
    <>
      <PageHeader
        title="Candidats"
        description="Les entreprises et personnes qui déposent des offres. Un candidat se saisit une seule fois, puis se choisit dans chaque procédure."
        actions={candidates !== null && candidates.length > 0 ? createButton : undefined}
      />

      {error && <Alert tone="error">{error}</Alert>}
      {candidates === null && !error && <p role="status">Chargement…</p>}

      {candidates?.length === 0 && (
        <section className="panel panel--flush">
          <EmptyState
            icon="users"
            title="Aucun candidat enregistré pour cette région."
            action={createButton}
          >
            Enregistrez les candidats avant de saisir leurs offres dans une procédure.
          </EmptyState>
        </section>
      )}

      {candidates !== null && candidates.length > 0 && (
        <section className="panel panel--flush">
          <div className="table-wrap">
            <table>
              <caption className="visually-hidden">Candidats de la région</caption>
              <thead>
                <tr>
                  <th scope="col">Nom</th>
                  <th scope="col">NIF</th>
                  <th scope="col">STAT</th>
                  <th scope="col">Contact</th>
                  <th scope="col" className="number">
                    Offres
                  </th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((candidate) => (
                  <tr key={candidate.id}>
                    <td>
                      <strong>{candidate.name}</strong>
                      {candidate.address && <div className="cell-note">{candidate.address}</div>}
                    </td>
                    <td>{candidate.nif ?? '—'}</td>
                    <td>{candidate.stat ?? '—'}</td>
                    <td>
                      {candidate.phone ?? '—'}
                      {candidate.email && <div className="cell-note">{candidate.email}</div>}
                    </td>
                    <td className="number">{candidate.bidCount}</td>
                    <td>
                      <div className="row-actions row-actions--inline">
                        {confirming === candidate.id ? (
                          <>
                            <button
                              type="button"
                              className="danger small"
                              disabled={busy}
                              onClick={() => void remove(candidate)}
                            >
                              Confirmer la suppression de {candidate.name}
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
                              className="secondary small"
                              aria-label={`Modifier ${candidate.name}`}
                              onClick={() => {
                                onEdit(candidate)
                              }}
                            >
                              <Icon name="pencil" size={15} />
                              Modifier
                            </button>
                            <button
                              type="button"
                              className="secondary small danger-outline"
                              aria-label={`Supprimer ${candidate.name}`}
                              onClick={() => {
                                setConfirming(candidate.id)
                                setError(null)
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
            </table>
          </div>
        </section>
      )}
    </>
  )
}
