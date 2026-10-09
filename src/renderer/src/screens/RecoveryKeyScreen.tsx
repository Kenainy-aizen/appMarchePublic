import { useState } from 'react'

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
    <section className="card">
      <h2>Clé de récupération — {regionName}</h2>
      <p className="message message--warning" role="note">
        Notez cette clé maintenant. Elle ne sera <strong>plus jamais affichée</strong>. Si vous
        oubliez le mot de passe de la région, elle est le seul moyen de récupérer les données.
      </p>

      <div className="print-area">
        <p className="print-title">Clé de récupération — {regionName}</p>
        <p className="recovery-key" aria-label="Clé de récupération">
          {recoveryKey}
        </p>
        <p className="print-note">À conserver en lieu sûr, séparément de l’ordinateur.</p>
      </div>

      <div className="actions">
        <button type="button" className="secondary" onClick={() => void copy()}>
          {copied ? 'Copiée' : 'Copier'}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            window.print()
          }}
        >
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
