import { Icon, type IconName } from './Icon'

type Tone = 'error' | 'warning' | 'info' | 'success'

const ICONS: Readonly<Record<Tone, IconName>> = {
  error: 'alert',
  warning: 'alert',
  info: 'info',
  success: 'check'
}

interface Props {
  readonly tone: Tone
  /** Par défaut : `alert` pour une erreur (annoncée immédiatement), `status` sinon. */
  readonly role?: 'alert' | 'status' | 'note'
  readonly children: React.ReactNode
}

export function Alert({ tone, role, children }: Props): React.JSX.Element {
  return (
    <div className={`alert alert--${tone}`} role={role ?? (tone === 'error' ? 'alert' : 'status')}>
      <Icon name={ICONS[tone]} />
      <div>{children}</div>
    </div>
  )
}
