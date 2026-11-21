import { useState, type SyntheticEvent } from 'react'
import type { AppInfoDto } from '@shared/api'
import { ALERT_HORIZON_CHOICES, ALERT_HORIZON_LABELS } from '@shared/alert-options'
import { messageOf, unwrap } from '../api-errors'
import { Alert } from '../ui/Alert'
import { PageHeader } from '../ui/PageHeader'

interface Props {
  readonly organizationName: string | null
  readonly appInfo: AppInfoDto | null
  readonly onSaved: (name: string) => void
  readonly alertHorizonDays: number
  readonly onAlertHorizonSaved: (days: number) => void
}

export function SettingsScreen({
  organizationName,
  appInfo,
  onSaved,
  alertHorizonDays,
  onAlertHorizonSaved
}: Props): React.JSX.Element {
  const [horizon, setHorizon] = useState(String(alertHorizonDays))
  const [horizonSaved, setHorizonSaved] = useState(false)
  const [horizonError, setHorizonError] = useState<string | null>(null)

  async function saveHorizon(event: SyntheticEvent): Promise<void> {
    event.preventDefault()
    setHorizonError(null)
    setHorizonSaved(false)
    try {
      const result = unwrap(await window.api.saveAlertHorizon({ days: Number(horizon) }))
      setHorizon(String(result.alertHorizonDays))
      setHorizonSaved(true)
      onAlertHorizonSaved(result.alertHorizonDays)
    } catch (failure) {
      setHorizonError(messageOf(failure))
    }
  }

  const [name, setName] = useState(organizationName ?? '')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(event: SyntheticEvent): Promise<void> {
    event.preventDefault()
    setPending(true)
    setError(null)
    setSaved(false)
    try {
      const result = unwrap(await window.api.saveOrganization({ name }))
      setName(result.name)
      setSaved(true)
      onSaved(result.name)
    } catch (failure) {
      setError(messageOf(failure))
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Paramètres"
        description="Informations générales de l’application, communes à toutes les régions."
      />

      <form className="panel" onSubmit={(event) => void submit(event)}>
        <h2 className="panel__title">Identité de la PRMP</h2>
        <label htmlFor="organization">Nom de la PRMP</label>
        <input
          id="organization"
          value={name}
          maxLength={120}
          onChange={(event) => {
            setName(event.target.value)
            setSaved(false)
          }}
          required
        />
        <p className="hint">
          Il s’affiche en haut de l’application et servira sur les états imprimés.
        </p>

        {error && <Alert tone="error">{error}</Alert>}
        {saved && <Alert tone="success">Nom enregistré.</Alert>}

        <div className="actions" style={{ marginTop: '1.25rem' }}>
          <button type="submit" disabled={pending}>
            {pending ? 'Enregistrement…' : 'Enregistrer le nom'}
          </button>
        </div>
      </form>

      <form className="panel" onSubmit={(event) => void saveHorizon(event)}>
        <h2 className="panel__title">Alertes d’échéances</h2>
        <label htmlFor="alert-horizon">Signaler les échéances à l’avance</label>
        <select
          id="alert-horizon"
          value={horizon}
          onChange={(event) => {
            setHorizon(event.target.value)
            setHorizonSaved(false)
          }}
        >
          {ALERT_HORIZON_CHOICES.map((days) => (
            <option key={days} value={days}>
              {ALERT_HORIZON_LABELS[days]}
            </option>
          ))}
        </select>
        <p className="hint">
          Les échéances dépassées sont toujours signalées. Ce délai s’applique à toutes les régions.
        </p>

        {horizonError && <Alert tone="error">{horizonError}</Alert>}
        {horizonSaved && <Alert tone="success">Délai enregistré.</Alert>}

        <div className="actions" style={{ marginTop: '1.25rem' }}>
          <button type="submit">Enregistrer le délai</button>
        </div>
      </form>

      <section className="panel" aria-labelledby="about">
        <h2 className="panel__title" id="about">
          À propos
        </h2>
        <dl className="ledger">
          <div>
            <dt>Version de l’application</dt>
            <dd>{appInfo?.version ?? '—'}</dd>
          </div>
          <div>
            <dt>Stockage des données</dt>
            <dd>Sur cet ordinateur, une base chiffrée par région</dd>
          </div>
        </dl>
      </section>
    </>
  )
}
