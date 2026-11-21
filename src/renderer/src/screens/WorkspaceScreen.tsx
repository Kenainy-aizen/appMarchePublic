import { useCallback, useEffect, useState } from 'react'
import type { AlertDto, AlertsDto, AppInfoDto, RegionSummaryDto } from '@shared/api'
import { messageOf, unwrap } from '../api-errors'
import { AppShell, type SectionId } from '../layouts/AppShell'
import { Alert } from '../ui/Alert'
import { AlertsScreen } from './AlertsScreen'
import { HomeSection } from './HomeSection'
import { CandidateModule } from './candidates/CandidateModule'
import { ContractModule, type ContractIntent } from './contracts/ContractModule'
import { PpmModule } from './ppm/PpmModule'
import { ProcedureModule } from './procedures/ProcedureModule'
import { SettingsScreen } from './SettingsScreen'

interface Props {
  readonly region: RegionSummaryDto
  readonly organizationName: string | null
  readonly appInfo: AppInfoDto | null
  readonly onClosed: () => void
  readonly onOrganizationSaved: (name: string) => void
  readonly alertHorizonDays: number
  readonly onAlertHorizonSaved: (days: number) => void
}

/** Espace de travail d'une région ouverte : navigation et page affichée. */
export function WorkspaceScreen({
  region,
  organizationName,
  appInfo,
  onClosed,
  onOrganizationSaved,
  alertHorizonDays,
  onAlertHorizonSaved
}: Props): React.JSX.Element {
  const [section, setSection] = useState<SectionId>('home')
  const [error, setError] = useState<string | null>(null)
  const [contractIntent, setContractIntent] = useState<ContractIntent | null>(null)
  const [procedureToOpen, setProcedureToOpen] = useState<string | null>(null)
  const [ppmToOpen, setPpmToOpen] = useState<string | null>(null)
  const [alerts, setAlerts] = useState<AlertsDto | null>(null)
  const [alertsError, setAlertsError] = useState<string | null>(null)

  /** Recharge les alertes (calculées à chaque appel) : au départ, à chaque changement de page, après un réglage. */
  const refreshAlerts = useCallback(async (): Promise<void> => {
    try {
      setAlerts(unwrap(await window.api.listAlerts()))
      setAlertsError(null)
    } catch (failure) {
      setAlertsError(messageOf(failure))
    }
  }, [])

  useEffect(() => {
    void refreshAlerts()
  }, [section, refreshAlerts])

  /** Ouvre l'élément concerné par une alerte. */
  function openAlertTarget(target: AlertDto['target']): void {
    if (target.kind === 'PROCEDURE') {
      setProcedureToOpen(target.id)
      setSection('procedures')
    } else if (target.kind === 'CONTRACT') {
      goToContracts({ kind: 'open', contractId: target.id })
    } else {
      setPpmToOpen(target.id)
      setSection('ppm')
    }
  }

  /** Va au module des contrats, avec ou sans demande précise (créer un marché, ouvrir un contrat). */
  function goToContracts(intent: ContractIntent | null): void {
    setContractIntent(intent)
    setSection('contracts')
  }

  async function switchRegion(): Promise<void> {
    try {
      unwrap(await window.api.closeSession())
      onClosed()
    } catch (failure) {
      setError(messageOf(failure))
    }
  }

  return (
    <AppShell
      organizationName={organizationName}
      regionName={region.name}
      appInfo={appInfo}
      section={section}
      alertCounts={
        alerts === null ? null : { overdue: alerts.overdueCount, upcoming: alerts.upcomingCount }
      }
      onNavigate={(next) => {
        if (next === 'contracts') setContractIntent(null)
        if (next === 'procedures') setProcedureToOpen(null)
        if (next === 'ppm') setPpmToOpen(null)
        setSection(next)
      }}
      onSwitchRegion={() => void switchRegion()}
    >
      {error && <Alert tone="error">{error}</Alert>}
      {section === 'home' && (
        <HomeSection
          regionName={region.name}
          organizationName={organizationName}
          alerts={alerts}
          onNavigate={setSection}
        />
      )}
      {section === 'alerts' && (
        <AlertsScreen
          alerts={alerts}
          error={alertsError}
          onOpen={openAlertTarget}
          onOpenSettings={() => {
            setSection('settings')
          }}
        />
      )}
      {section === 'ppm' && <PpmModule initialPpmId={ppmToOpen} />}
      {section === 'procedures' && (
        <ProcedureModule
          initialProcedureId={procedureToOpen}
          onCreateContract={(procedureId) => {
            goToContracts({ kind: 'create', procedureId })
          }}
          onOpenContract={(contractId) => {
            goToContracts({ kind: 'open', contractId })
          }}
        />
      )}
      {section === 'candidates' && <CandidateModule />}
      {section === 'contracts' && <ContractModule intent={contractIntent} />}
      {section === 'settings' && (
        <SettingsScreen
          organizationName={organizationName}
          appInfo={appInfo}
          onSaved={onOrganizationSaved}
          alertHorizonDays={alertHorizonDays}
          onAlertHorizonSaved={(days) => {
            onAlertHorizonSaved(days)
            void refreshAlerts()
          }}
        />
      )}
    </AppShell>
  )
}
