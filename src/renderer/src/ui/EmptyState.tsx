import { Icon, type IconName } from './Icon'

interface Props {
  readonly icon: IconName
  readonly title: string
  readonly children?: React.ReactNode
  readonly action?: React.ReactNode
}

/** Écran vide : dit ce qui manque et propose l'action pour y remédier. */
export function EmptyState({ icon, title, children, action }: Props): React.JSX.Element {
  return (
    <div className="empty">
      <Icon name={icon} size={28} />
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action && <div className="actions">{action}</div>}
    </div>
  )
}
