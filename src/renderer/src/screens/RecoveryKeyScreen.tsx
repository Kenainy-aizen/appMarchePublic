import { useState } from 'react'
import { Alert } from '../ui/Alert'
import { Icon } from '../ui/Icon'

interface Props {
  readonly regionName: string
  readonly recoveryKey: string
  readonly onContinue: () => void
}

/** Affiche la clé de récupération UNE fois et ne laisse continuer qu'après confirmation explicite. */
export function RecoveryKeyScreen({
  regionName,
  recoveryKey,
  onContinue
}: Props): React.JSX.Element {
  const [confirmed, setConfirmed] = useState(false)
  const [copied, setCopied] = useState(false)

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(recoveryKey)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <section>
      <h1>Clé de récupération — {regionName}</h1>
      <Alert tone="warning" role="note">
        <span>
          Notez cette clé maintenant. Elle ne sera <strong>plus jamais affichée</strong>. Si vous
          oubliez le mot de passe de la région, elle est le seul moyen de récupérer les données.
        </span>
      </Alert>

      <div className="print-area">
        <p className="print-title">Clé de récupération — {regionName}</p>
        <p className="recovery-key" aria-label="Clé de récupération">
          {recoveryKey.split('-').map((group, index, groups) => (
            <span className="recovery-key__group" key={`${group}-${String(index)}`}>
              {index < groups.length - 1 ? `${group}-` : group}
            </span>
          ))}
        </p>
        <p className="print-note">À conserver en lieu sûr, séparément de l’ordinateur.</p>
      </div>

      <div className="actions">
        <button type="button" className="secondary" onClick={() => void copy()}>
          <Icon name={copied ? 'check' : 'copy'} size={16} />
          {copied ? 'Copiée' : 'Copier'}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            window.print()
          }}
        >
          <Icon name="printer" size={16} />
          Imprimer
        </button>
      </div>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => {
            setConfirmed(event.target.checked)
          }}
        />
        J’ai conservé cette clé de récupération dans un endroit sûr.
      </label>

      <div className="actions">
        <button type="button" disabled={!confirmed} onClick={onContinue}>
          Continuer
        </button>
      </div>
    </section>
  )
}
