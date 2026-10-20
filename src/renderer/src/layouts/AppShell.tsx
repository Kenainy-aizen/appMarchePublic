import type { AppInfoDto } from '@shared/api'
import { FlagMark, Icon, type IconName } from '../ui/Icon'

export type SectionId = 'home' | 'ppm' | 'procedures' | 'candidates' | 'settings'

interface NavEntry {
  readonly id: SectionId | null
  readonly label: string
  readonly icon: IconName
  /** Module prévu mais pas encore livré. */
  readonly soon?: boolean
}

const MAIN_NAV: readonly NavEntry[] = [
  { id: 'home', label: 'Accueil', icon: 'home' },
  { id: 'ppm', label: 'Plan de passation (PPM)', icon: 'list' },
  { id: 'procedures', label: 'Procédures', icon: 'briefcase' },
  { id: 'candidates', label: 'Candidats', icon: 'users' },
  { id: null, label: 'Contrats', icon: 'contract', soon: true }
]

interface Props {
  readonly organizationName: string | null
  readonly regionName: string
  readonly appInfo: AppInfoDto | null
  readonly section: SectionId
  readonly onNavigate: (section: SectionId) => void
  readonly onSwitchRegion: () => void
  readonly children: React.ReactNode
}

/** Espace de travail : navigation à gauche, bandeau de la PRMP et de la région, contenu de la page. */
export function AppShell({
  organizationName,
  regionName,
  appInfo,
  section,
  onNavigate,
  onSwitchRegion,
  children
}: Props): React.JSX.Element {
  const renderEntry = (entry: NavEntry): React.JSX.Element => (
    <li key={entry.label}>
      <button
        type="button"
        className="nav-item"
        disabled={entry.soon === true}
        {...(entry.id !== null && entry.id === section ? { 'aria-current': 'page' as const } : {})}
        onClick={() => {
          if (entry.id !== null) onNavigate(entry.id)
        }}
      >
        <Icon name={entry.icon} />
        {entry.label}
        {entry.soon && <span className="nav-item__tag">Bientôt</span>}
      </button>
    </li>
  )

  return (
    <div className="shell">
      <a
        className="skip-link"
        href="#contenu"
        onClick={(event) => {
          event.preventDefault()
          document.getElementById('contenu')?.focus()
        }}
      >
        Aller au contenu
      </a>

      <aside className="sidebar">
        <div className="sidebar__brand">
          <FlagMark />
          <span>Suivi des marchés publics</span>
        </div>
        <nav aria-label="Navigation principale">
          <ul>{MAIN_NAV.map(renderEntry)}</ul>
        </nav>
        <div className="sidebar__bottom">
          <ul>{renderEntry({ id: 'settings', label: 'Paramètres', icon: 'sliders' })}</ul>
          {appInfo && <p className="sidebar__version">Version {appInfo.version}</p>}
        </div>
      </aside>

      <div className="shell__main">
        <header className="topbar">
          <div className="topbar__org">
            {organizationName ?? (
              <button
                type="button"
                onClick={() => {
                  onNavigate('settings')
                }}
              >
                Renseigner le nom de la PRMP
              </button>
            )}
          </div>
          <div className="topbar__region">
            <span className="chip">
              <Icon name="pin" size={15} />
              Région : {regionName}
            </span>
            <button type="button" className="secondary small" onClick={onSwitchRegion}>
              <Icon name="swap" size={16} />
              Changer de région
            </button>
          </div>
        </header>
        <main className="page" id="contenu" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  )
}
