import { useCallback, useEffect, useState } from 'react'
import type {
  AppInfoDto,
  CreateRegionResultDto,
  RegionsOverviewDto,
  RegionSummaryDto
} from '@shared/api'
import { messageOf, unwrap } from './api-errors'
import { AuthLayout } from './layouts/AuthLayout'
import { CreateRegionScreen } from './screens/CreateRegionScreen'
import { LoginScreen } from './screens/LoginScreen'
import { RecoveryKeyScreen } from './screens/RecoveryKeyScreen'
import { SetupScreen } from './screens/SetupScreen'
import { WorkspaceScreen } from './screens/WorkspaceScreen'
import { Alert } from './ui/Alert'

type View =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'login'; readonly overview: RegionsOverviewDto }
  | { readonly kind: 'setup'; readonly overview: RegionsOverviewDto }
  | { readonly kind: 'create'; readonly overview: RegionsOverviewDto }
  | {
      readonly kind: 'recovery'
      readonly created: CreateRegionResultDto
      /** Vrai pendant la toute première configuration (affiche les étapes). */
      readonly firstRun: boolean
    }
  | { readonly kind: 'workspace'; readonly region: RegionSummaryDto }

const SETUP_STEPS = ['Identité de la PRMP', 'Première région', 'Clé de récupération'] as const

const entryView = (overview: RegionsOverviewDto): View =>
  overview.regions.length === 0 ? { kind: 'setup', overview } : { kind: 'login', overview }

export function App(): React.JSX.Element {
  const [view, setView] = useState<View>({ kind: 'loading' })
  const [appInfo, setAppInfo] = useState<AppInfoDto | null>(null)
  const [organizationName, setOrganizationName] = useState<string | null>(null)

  /** Va à l'écran de connexion, ou à la configuration initiale s'il n'existe encore aucune région. */
  const showEntryScreen = useCallback(async (): Promise<void> => {
    try {
      const overview = unwrap(await window.api.getRegionsOverview())
      setOrganizationName(overview.organizationName)
      setView(entryView(overview))
    } catch (failure) {
      setView({ kind: 'failed', message: messageOf(failure) })
    }
  }, [])

  useEffect(() => {
    void window.api.getAppInfo().then(setAppInfo, () => undefined)
    void (async () => {
      try {
        const overview = unwrap(await window.api.getRegionsOverview())
        setOrganizationName(overview.organizationName)
        const { region } = unwrap(await window.api.getSession())
        setView(region ? { kind: 'workspace', region } : entryView(overview))
      } catch (failure) {
        setView({ kind: 'failed', message: messageOf(failure) })
      }
    })()
  }, [])

  if (view.kind === 'workspace') {
    return (
      <WorkspaceScreen
        region={view.region}
        organizationName={organizationName}
        appInfo={appInfo}
        onClosed={() => void showEntryScreen()}
        onOrganizationSaved={setOrganizationName}
      />
    )
  }

  if (view.kind === 'loading' || view.kind === 'failed') {
    return (
      <div className="splash">
        {view.kind === 'loading' ? (
          <p role="status">Chargement…</p>
        ) : (
          <Alert tone="error">{view.message}</Alert>
        )}
      </div>
    )
  }

  const steps =
    view.kind === 'setup'
      ? { items: SETUP_STEPS, current: 0 }
      : view.kind === 'recovery' && view.firstRun
        ? { items: SETUP_STEPS, current: 2 }
        : undefined

  return (
    <AuthLayout organizationName={organizationName} appInfo={appInfo} {...(steps ? { steps } : {})}>
      {view.kind === 'login' && (
        <LoginScreen
          regions={view.overview.regions}
          canCreate={view.overview.canCreate}
          onOpened={(region) => {
            setView({ kind: 'workspace', region })
          }}
          onCreateRequested={() => {
            setView({ kind: 'create', overview: view.overview })
          }}
        />
      )}

      {view.kind === 'setup' && (
        <SetupScreen
          initialOrganizationName={view.overview.organizationName}
          suggestedRegionName={view.overview.suggestedName}
          onCreated={(created, savedName) => {
            setOrganizationName(savedName)
            setView({ kind: 'recovery', created, firstRun: true })
          }}
        />
      )}

      {view.kind === 'create' && (
        <CreateRegionScreen
          suggestedName={view.overview.suggestedName}
          onCreated={(created) => {
            setView({ kind: 'recovery', created, firstRun: false })
          }}
          onCancel={() => {
            setView({ kind: 'login', overview: view.overview })
          }}
        />
      )}

      {view.kind === 'recovery' && (
        <RecoveryKeyScreen
          regionName={view.created.region.name}
          recoveryKey={view.created.recoveryKey}
          onContinue={() => void showEntryScreen()}
        />
      )}
    </AuthLayout>
  )
}
