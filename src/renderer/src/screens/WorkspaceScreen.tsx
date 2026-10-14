import { useState } from 'react'
import type { AppInfoDto, RegionSummaryDto } from '@shared/api'
import { messageOf, unwrap } from '../api-errors'
import { AppShell, type SectionId } from '../layouts/AppShell'
import { Alert } from '../ui/Alert'
import { HomeSection } from './HomeSection'
import { PpmModule } from './ppm/PpmModule'
import { SettingsScreen } from './SettingsScreen'

interface Props {
  readonly region: RegionSummaryDto
  readonly organizationName: string | null
  readonly appInfo: AppInfoDto | null
  readonly onClosed: () => void
  readonly onOrganizationSaved: (name: string) => void
}

/** Espace de travail d'une région ouverte : navigation et page affichée. */
export function WorkspaceScreen({
  region,
  organizationName,
  appInfo,
  onClosed,
  onOrganizationSaved
}: Props): React.JSX.Element {
  const [section, setSection] = useState<SectionId>('home')
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
    <AppShell
      organizationName={organizationName}
      regionName={region.name}
      appInfo={appInfo}
      section={section}
      onNavigate={setSection}
      onSwitchRegion={() => void switchRegion()}
    >
      {error && <Alert tone="error">{error}</Alert>}
      {section === 'home' && (
        <HomeSection
          regionName={region.name}
          organizationName={organizationName}
          onNavigate={setSection}
        />
      )}
      {section === 'ppm' && <PpmModule />}
      {section === 'settings' && (
        <SettingsScreen
          organizationName={organizationName}
          appInfo={appInfo}
          onSaved={onOrganizationSaved}
        />
      )}
    </AppShell>
  )
}
