import { useState, type SyntheticEvent } from 'react'
import type { RegionSummaryDto } from '@shared/api'
import { messageOf, unwrap } from '../api-errors'
import { Alert } from '../ui/Alert'

interface Props {
  readonly regions: readonly RegionSummaryDto[]
  readonly canCreate: boolean
  readonly onOpened: (region: RegionSummaryDto) => void
  readonly onCreateRequested: () => void
}

export function LoginScreen({
  regions,
  canCreate,
  onOpened,
  onCreateRequested
}: Props): React.JSX.Element {
  const [regionId, setRegionId] = useState(regions[0]?.id ?? '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(event: SyntheticEvent): Promise<void> {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      const region = unwrap(await window.api.openRegion({ regionId, password }))
      setPassword('')
      onOpened(region)
    } catch (failure) {
      setPassword('')
      setError(messageOf(failure))
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)}>
      <h1>Connexion à une région</h1>
      <p className="auth__lead">
        Choisissez la région à ouvrir et saisissez son mot de passe. Les données des autres régions
        restent fermées.
      </p>

      <label htmlFor="region">Région</label>
      <select
        id="region"
        value={regionId}
        onChange={(event) => {
          setRegionId(event.target.value)
        }}
      >
        {regions.map((region) => (
          <option key={region.id} value={region.id}>
            {region.name}
          </option>
        ))}
      </select>

      <label htmlFor="password">Mot de passe de la région</label>
      <input
        id="password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => {
          setPassword(event.target.value)
        }}
        required
      />

      {error && <Alert tone="error">{error}</Alert>}

      <div className="actions">
        <button type="submit" disabled={pending || password.length === 0}>
          {pending ? 'Vérification…' : 'Ouvrir la région'}
        </button>
        {canCreate && (
          <button type="button" className="secondary" onClick={onCreateRequested}>
            Créer une région
          </button>
        )}
      </div>
    </form>
  )
}
