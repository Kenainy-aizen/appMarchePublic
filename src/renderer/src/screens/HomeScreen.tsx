import { useState } from 'react'
import type { AppInfoDto, RegionSummaryDto } from '@shared/api'
import { messageOf, unwrap } from '../api-errors'

interface Props {
  readonly region: RegionSummaryDto
  readonly appInfo: AppInfoDto | null
  readonly onClosed: () => void
}

export function HomeScreen({ region, appInfo, onClosed }: Props): React.JSX.Element {
  const [error, setError] = useState<string | null>(null)

  async function switchRegion(): Promise<void> {
    try {
      unwrap(await window.api.closeSession())
      onClosed()
    } catch (failure) {
      setError(messageOf(failure))
    }
  }

  return (
    <section className="card">
      <h2>Région : {region.name}</h2>
      <p role="status">Vous êtes connecté. Seules les données de cette région sont accessibles.</p>
      <p className="hint">
        Les modules (plan de passation, procédures, contrats…) arrivent dans les prochaines phases.
      </p>
      {error && (
        <p className="message message--error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="button" className="secondary" onClick={() => void switchRegion()}>
          Changer de région
        </button>
      </div>
      {appInfo && (
        <p className="footer">
          {appInfo.name} v{appInfo.version}
        </p>
      )}
    </section>
  )
}
