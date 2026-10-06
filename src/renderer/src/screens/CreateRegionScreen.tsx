import { useState, type SyntheticEvent } from 'react'
import type { CreateRegionResultDto } from '@shared/api'
import { messageOf, unwrap } from '../api-errors'

interface Props {
  readonly suggestedName: string
  readonly onCreated: (result: CreateRegionResultDto) => void
  /** Absent quand aucune région n'existe encore : il n'y a alors nulle part où revenir. */
  readonly onCancel?: () => void
}

export function CreateRegionScreen({
  suggestedName,
  onCreated,
  onCancel
}: Props): React.JSX.Element {
  const [name, setName] = useState(suggestedName)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(event: SyntheticEvent): Promise<void> {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      const result = unwrap(
        await window.api.createRegion({ name, password, passwordConfirmation: confirmation })
      )
      setPassword('')
      setConfirmation('')
      onCreated(result)
    } catch (failure) {
      setError(messageOf(failure))
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="card" onSubmit={(event) => void submit(event)}>
      <h2>Créer une région</h2>
      <p className="hint">
        Chaque région a son propre mot de passe. Les données de la région sont chiffrées avec ce mot
        de passe : sans lui (ou sans la clé de récupération), elles sont illisibles.
      </p>

      <label htmlFor="name">Nom de la région</label>
      <input
        id="name"
        value={name}
        onChange={(event) => {
          setName(event.target.value)
        }}
        required
      />

      <label htmlFor="new-password">Mot de passe (10 caractères minimum)</label>
      <input
        id="new-password"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(event) => {
          setPassword(event.target.value)
        }}
        required
      />
      <p className="hint">Une phrase de passe est recommandée, par exemple quatre ou cinq mots.</p>

      <label htmlFor="confirmation">Confirmer le mot de passe</label>
      <input
        id="confirmation"
        type="password"
        autoComplete="new-password"
        value={confirmation}
        onChange={(event) => {
          setConfirmation(event.target.value)
        }}
        required
      />

      {error && (
        <p className="message message--error" role="alert">
          {error}
        </p>
      )}

      <div className="actions">
        <button type="submit" disabled={pending}>
          {pending ? 'Création en cours…' : 'Créer la région'}
        </button>
        {onCancel && (
          <button type="button" className="secondary" onClick={onCancel} disabled={pending}>
            Annuler
          </button>
        )}
      </div>
    </form>
  )
}
