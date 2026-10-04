import { useEffect, useState } from 'react'
import type { AppInfoDto } from '@shared/api'

export function App(): React.JSX.Element {
  const [info, setInfo] = useState<AppInfoDto | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api
      .getAppInfo()
      .then(setInfo)
      .catch(() => {
        setError('Impossible de joindre le processus principal.')
      })
  }, [])

  return (
    <main className="app">
      <h1>Suivi des marchés publics</h1>
      <p className="subtitle">Application locale de la PRMP</p>
      {info && (
        <p className="status" role="status">
          Application prête — {info.name} v{info.version}
        </p>
      )}
      {error && (
        <p className="status status--error" role="alert">
          {error}
        </p>
      )}
    </main>
  )
}
