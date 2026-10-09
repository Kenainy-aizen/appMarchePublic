import { useCallback, useEffect, useState } from 'react'
import type {
  AppInfoDto,
  CreateRegionResultDto,
  RegionsOverviewDto,
  RegionSummaryDto
} from '@shared/api'
import { messageOf, unwrap } from './api-errors'
import { CreateRegionScreen } from './screens/CreateRegionScreen'
import { HomeScreen } from './screens/HomeScreen'
import { LoginScreen } from './screens/LoginScreen'
import { RecoveryKeyScreen } from './screens/RecoveryKeyScreen'

type View =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'login'; readonly overview: RegionsOverviewDto }
  | { readonly kind: 'create'; readonly overview: RegionsOverviewDto }
  | { readonly kind: 'recovery'; readonly created: CreateRegionResultDto }
  | { readonly kind: 'home'; readonly region: RegionSummaryDto }

export function App(): React.JSX.Element {
  const [view, setView] = useState<View>({ kind: 'loading' })
  const [appInfo, setAppInfo] = useState<AppInfoDto | null>(null)

  /** Va à l'écran de connexion, ou à la création s'il n'existe encore aucune région. */
  const showEntryScreen = useCallback(async (): Promise<void> => {
    try {
      const overview = unwrap(await window.api.getRegionsOverview())
      setView(
        overview.regions.length === 0 ? { kind: 'create', overview } : { kind: 'login', overview }
      )
    } catch (failure) {
      setView({ kind: 'failed', message: messageOf(failure) })
    }
  }, [])

  useEffect(() => {
    void window.api.getAppInfo().then(setAppInfo, () => undefined)
    void (async () => {
      try {
        const { region } = unwrap(await window.api.getSession())
        if (region) setView({ kind: 'home', region })
        else await showEntryScreen()
      } catch (failure) {
        setView({ kind: 'failed', message: messageOf(failure) })
      }
    })()
  }, [showEntryScreen])

  return (
    <main className="app">
      <h1>Suivi des marchés publics</h1>
      <p className="subtitle">Application locale de la PRMP</p>

      {view.kind === 'loading' && <p role="status">Chargement…</p>}

      {view.kind === 'failed' && (
        <p className="message message--error" role="alert">
          {view.message}
        </p>
      )}

      {view.kind === 'login' && (
        <LoginScreen
          regions={view.overview.regions}
          canCreate={view.overview.canCreate}
          onOpened={(region) => {
            setView({ kind: 'home', region })
          }}
          onCreateRequested={() => {
            setView({ kind: 'create', overview: view.overview })
          }}
        />
      )}

      {view.kind === 'create' && (
        <CreateRegionScreen
          suggestedName={view.overview.suggestedName}
          onCreated={(created) => {
            setView({ kind: 'recovery', created })
          }}
          {...(view.overview.regions.length > 0
            ? {
                onCancel: () => {
                  setView({ kind: 'login', overview: view.overview })
                }
              }
            : {})}
        />
      )}

      {view.kind === 'recovery' && (
        <RecoveryKeyScreen
          regionName={view.created.region.name}
          recoveryKey={view.created.recoveryKey}
          onContinue={() => void showEntryScreen()}
        />
      )}

      {view.kind === 'home' && (
        <HomeScreen
          region={view.region}
          appInfo={appInfo}
          onClosed={() => void showEntryScreen()}
        />
      )}
    </main>
  )
}
