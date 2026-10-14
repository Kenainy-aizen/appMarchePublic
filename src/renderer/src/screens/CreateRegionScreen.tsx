import { useState, type SyntheticEvent } from 'react'
import type { CreateRegionResultDto } from '@shared/api'
import { messageOf, unwrap } from '../api-errors'
import { Alert } from '../ui/Alert'

interface Props {
  readonly suggestedName: string
  readonly onCreated: (result: CreateRegionResultDto) => void
  readonly onCancel: () => void
}

/** Ajout d'une région supplémentaire (le nom de la PRMP est déjà connu). */
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
    <form onSubmit={(event) => void submit(event)}>
      <h1>Créer une région</h1>
      <p className="auth__lead">
        Chaque région a son propre mot de passe. Sans lui, ni la clé de récupération, ses données
        sont illisibles.
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

      <div className="form-row">
        <div>
          <label htmlFor="new-password">Mot de passe</label>
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
        </div>
        <div>
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
        </div>
      </div>
      <p className="hint">
        10 caractères minimum. Une phrase de passe est recommandée, par exemple quatre ou cinq mots.
      </p>

      {error && <Alert tone="error">{error}</Alert>}

      <div className="actions">
        <button type="submit" disabled={pending}>
          {pending ? 'Création en cours…' : 'Créer la région'}
        </button>
        <button type="button" className="secondary" onClick={onCancel} disabled={pending}>
          Annuler
        </button>
      </div>
    </form>
  )
}
