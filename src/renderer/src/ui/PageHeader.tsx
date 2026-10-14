interface Props {
  readonly title: string
  readonly description?: string
  readonly actions?: React.ReactNode
}

/** Titre de la page (h1), phrase d'explication et actions principales. */
export function PageHeader({ title, description, actions }: Props): React.JSX.Element {
  return (
    <header className="page-header">
      <div className="page-header__text">
        <h1>{title}</h1>
        {description && <p className="page-header__description">{description}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  )
}
