import { useState, type SyntheticEvent } from 'react'
import type { CandidateDto } from '@shared/api'
import { messageOf, unwrap } from '../../api-errors'
import { emptyToNull } from '../../format'
import { Alert } from '../../ui/Alert'
import { Icon } from '../../ui/Icon'
import { PageHeader } from '../../ui/PageHeader'

interface Props {
  /** null = nouveau candidat. */
  readonly candidate: CandidateDto | null
  readonly onSaved: () => void
  readonly onCancel: () => void
}

export function CandidateForm({ candidate, onSaved, onCancel }: Props): React.JSX.Element {
  const [name, setName] = useState(candidate?.name ?? '')
  const [nif, setNif] = useState(candidate?.nif ?? '')
  const [stat, setStat] = useState(candidate?.stat ?? '')
  const [address, setAddress] = useState(candidate?.address ?? '')
  const [phone, setPhone] = useState(candidate?.phone ?? '')
  const [email, setEmail] = useState(candidate?.email ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(event: SyntheticEvent): Promise<void> {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      const fields = {
        name,
        nif: emptyToNull(nif),
        stat: emptyToNull(stat),
        address: emptyToNull(address),
        phone: emptyToNull(phone),
        email: emptyToNull(email)
      }
      unwrap(
        candidate
          ? await window.api.updateCandidate({ ...fields, candidateId: candidate.id })
          : await window.api.createCandidate(fields)
      )
      onSaved()
    } catch (failure) {
      setError(messageOf(failure))
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <PageHeader
        title={candidate ? 'Modifier le candidat' : 'Nouveau candidat'}
        description="Seul le nom est obligatoire. Deux candidats ne peuvent pas avoir le même NIF."
      />

      <form className="panel" onSubmit={(event) => void submit(event)}>
        <label htmlFor="cand-name">Nom du candidat</label>
        <input
          id="cand-name"
          type="text"
          value={name}
          maxLength={200}
          onChange={(event) => {
            setName(event.target.value)
          }}
          required
        />

        <div className="form-row">
          <div>
            <label htmlFor="cand-nif">NIF</label>
            <input
              id="cand-nif"
              type="text"
              value={nif}
              onChange={(event) => {
                setNif(event.target.value)
              }}
            />
          </div>
          <div>
            <label htmlFor="cand-stat">STAT</label>
            <input
              id="cand-stat"
              type="text"
              value={stat}
              onChange={(event) => {
                setStat(event.target.value)
              }}
            />
          </div>
        </div>

        <label htmlFor="cand-address">Adresse</label>
        <input
          id="cand-address"
          type="text"
          value={address}
          onChange={(event) => {
            setAddress(event.target.value)
          }}
        />

        <div className="form-row">
          <div>
            <label htmlFor="cand-phone">Téléphone</label>
            <input
              id="cand-phone"
              type="text"
              value={phone}
              onChange={(event) => {
                setPhone(event.target.value)
              }}
            />
          </div>
          <div>
            <label htmlFor="cand-email">Courriel</label>
            <input
              id="cand-email"
              type="text"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
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
              : candidate
                ? 'Enregistrer les modifications'
                : 'Créer le candidat'}
          </button>
          <button type="button" className="secondary" onClick={onCancel}>
            Annuler
          </button>
        </div>
      </form>
    </>
  )
}
