import { STATUS_LABELS, type StatusCode } from '@shared/procedure-options'

interface Props {
  readonly status: string
  readonly validatedCount: number
  readonly totalSteps: number
}

/** Avancement d'une procédure : cases remplies, « n sur 5 » et statut en toutes lettres. */
export function ProgressBadge({ status, validatedCount, totalSteps }: Props): React.JSX.Element {
  const label = STATUS_LABELS[status as StatusCode]
  return (
    <span className="progress">
      <span className="meter" aria-hidden="true">
        {Array.from({ length: totalSteps }, (_, index) => (
          <span
            key={index}
            className={index < validatedCount ? 'meter__cell is-done' : 'meter__cell'}
          />
        ))}
      </span>
      <span>
        {validatedCount} sur {totalSteps} — {label}
      </span>
    </span>
  )
}
