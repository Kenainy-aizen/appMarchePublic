import { useState, type SyntheticEvent } from 'react'
import type { CreateRegionResultDto } from '@shared/api'
import { messageOf, unwrap } from '../api-errors'
import { Alert } from '../ui/Alert'

interface Props {
  /** Nom déjà enregistré lors d'une tentative précédente interrompue (modifiable). */
  readonly initialOrganizationName: string | null
  readonly suggestedRegionName: string
  readonly onCreated: (result: CreateRegionResultDto, organizationName: string) => void
}

/** Premier lancement : identité de la PRMP, puis première région avec son mot de passe. */
export function SetupScreen({
  initialOrganizationName,
  suggestedRegionName,
  onCreated
}: Props): React.JSX.Element {
  const [organizationName, setOrganizationName] = useState(initialOrganizationName ?? '')
  const [regionName, setRegionName] = useState(suggestedRegionName)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(event: SyntheticEvent): Promise<void> {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      const saved = unwrap(await window.api.saveOrganization({ name: organizationName }))
      const result = unwrap(
        await window.api.createRegion({
          name: regionName,
          password,
          passwordConfirmation: confirmation
        })
      )
      setPassword('')
      setConfirmation('')
      onCreated(result, saved.name)
    } catch (failure) {
      setError(messageOf(failure))
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)}>
      <h1>Configurer l’application</h1>
      <p className="auth__lead">
        Ces informations sont demandées une seule fois. Elles restent sur cet ordinateur.
      </p>

      <section className="auth__section">
        <h2>Votre PRMP</h2>
        <label htmlFor="organization">Nom de la PRMP</label>
        <input
          id="organization"
          value={organizationName}
          maxLength={120}
          autoComplete="organization"
          onChange={(event) => {
            setOrganizationName(event.target.value)
          }}
          required
        />
        <p className="hint">
          Il s’affiche en haut de l’application et servira sur les états imprimés. Exemple : PRMP du
          Ministère de l’Environnement, Fianarantsoa.
        </p>
      </section>

      <section className="auth__section">
        <h2>Première région</h2>
        <p className="hint">
          Chaque région a son propre mot de passe. Sans lui, ni la clé de récupération, ses données
          sont illisibles.
        </p>

        <label htmlFor="name">Nom de la région</label>
        <input
          id="name"
          value={regionName}
          onChange={(event) => {
            setRegionName(event.target.value)
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
          10 caractères minimum. Une phrase de passe est recommandée, par exemple quatre ou cinq
          mots.
        </p>
      </section>

      {error && <Alert tone="error">{error}</Alert>}

      <div className="actions">
        <button type="submit" disabled={pending}>
          {pending ? 'Création en cours…' : 'Créer la région'}
        </button>
      </div>
    </form>
  )
}
