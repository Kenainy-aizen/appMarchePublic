import type { AppInfoDto } from '@shared/api'
import { FlagMark, Icon } from '../ui/Icon'

interface Props {
  /** Nom de la PRMP, affiché en grand ; absent au tout premier lancement. */
  readonly organizationName: string | null
  readonly appInfo: AppInfoDto | null
  /** Étapes de la première configuration (c'est une vraie suite : 1, 2, 3). */
  readonly steps?: { readonly items: readonly string[]; readonly current: number }
  readonly children: React.ReactNode
}

/** Écrans d'accès : panneau institutionnel à gauche, formulaire à droite. */
export function AuthLayout({
  organizationName,
  appInfo,
  steps,
  children
}: Props): React.JSX.Element {
  return (
    <div className="auth">
      <aside className="brand">
        <FlagMark width={36} />
        <div className="brand__body">
          {organizationName ? (
            <>
              <p className="brand__product">Suivi des marchés publics</p>
              <p className="brand__name">{organizationName}</p>
            </>
          ) : (
            <>
              <p className="brand__product">Application locale de la PRMP</p>
              <p className="brand__name">Suivi des marchés publics</p>
            </>
          )}
          {steps && (
            <ol className="brand__steps" aria-label="Étapes de la première configuration">
              {steps.items.map((item, index) => (
                <li key={item} {...(index === steps.current ? { 'aria-current': 'step' } : {})}>
                  {item}
                </li>
              ))}
            </ol>
          )}
        </div>
        <p className="brand__note">
          <Icon name="lock" />
          Vos données restent sur cet ordinateur. Chaque région est chiffrée avec son propre mot de
          passe.
        </p>
        {appInfo && <p className="brand__version">Version {appInfo.version}</p>}
      </aside>
      <main className="auth__main" id="contenu">
        <div className="auth__panel">{children}</div>
      </main>
    </div>
  )
}
