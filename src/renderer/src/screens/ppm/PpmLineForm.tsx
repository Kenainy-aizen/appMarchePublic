import { useState, type SyntheticEvent } from 'react'
import type { PpmLineDto, SavePpmLineInputDto } from '@shared/api'
import {
  METHOD_CODES,
  METHOD_LABELS,
  NATURE_CODES,
  NATURE_LABELS,
  type MethodCode,
  type NatureCode
} from '@shared/ppm-options'
import { messageOf, unwrap } from '../../api-errors'
import { emptyToNull, formatAriary, formatAmount, parseAmount, splitAccounts } from '../../format'
import { Alert } from '../../ui/Alert'
import { Icon } from '../../ui/Icon'
import { PageHeader } from '../../ui/PageHeader'

interface Props {
  readonly ppmId: string
  /** null = nouvelle ligne. */
  readonly line: PpmLineDto | null
  readonly onSaved: () => void
  readonly onCancel: () => void
}

interface BeneficiaryDraft {
  /** Clé stable pour React (la liste peut être réordonnée par des suppressions). */
  readonly key: number
  readonly service: string
  readonly amount: string
}

export function PpmLineForm({ ppmId, line, onSaved, onCancel }: Props): React.JSX.Element {
  const [nature, setNature] = useState<string>(line?.nature ?? NATURE_CODES[0])
  const [object, setObject] = useState(line?.object ?? '')
  const [financing, setFinancing] = useState(line?.financing ?? '')
  const [accounts, setAccounts] = useState(line?.accounts.join(', ') ?? '')
  const [launch, setLaunch] = useState(line?.plannedLaunchDate ?? '')
  const [opening, setOpening] = useState(line?.plannedBidOpeningDate ?? '')
  const [award, setAward] = useState(line?.plannedAwardDate ?? '')
  const [method, setMethod] = useState(line?.method ?? '')
  const [lead, setLead] = useState(line?.procedureLead ?? '')
  const [beneficiaries, setBeneficiaries] = useState<readonly BeneficiaryDraft[]>(
    (line?.beneficiaries ?? []).map((beneficiary, key) => ({
      key,
      service: beneficiary.service,
      amount: formatAmount(beneficiary.amount)
    }))
  )
  const [nextKey, setNextKey] = useState(line?.beneficiaries.length ?? 0)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const runningTotal = beneficiaries.reduce(
    (total, beneficiary) => total + (parseAmount(beneficiary.amount) ?? 0),
    0
  )

  function updateBeneficiary(key: number, changes: Partial<Omit<BeneficiaryDraft, 'key'>>): void {
    setBeneficiaries((current) =>
      current.map((beneficiary) =>
        beneficiary.key === key ? { ...beneficiary, ...changes } : beneficiary
      )
    )
  }

  /** Construit la requête, ou renvoie le message de la première saisie illisible. */
  function buildRequest(): SavePpmLineInputDto | string {
    const parsed: { service: string; amount: number }[] = []
    for (const [index, beneficiary] of beneficiaries.entries()) {
      const service = beneficiary.service.trim()
      const amountText = beneficiary.amount.trim()
      if (service === '' && amountText === '') continue // ligne vide ignorée
      const amount = parseAmount(amountText)
      if (amount === null) {
        return `Le montant du service ${index + 1} est invalide : saisissez un nombre entier (par exemple 1 500 000).`
      }
      parsed.push({ service, amount })
    }
    return {
      ppmId,
      lineId: line?.id ?? null,
      nature: nature as NatureCode,
      object,
      financing: emptyToNull(financing),
      accounts: splitAccounts(accounts),
      plannedLaunchDate: emptyToNull(launch),
      plannedBidOpeningDate: emptyToNull(opening),
      plannedAwardDate: emptyToNull(award),
      beneficiaries: parsed,
      method: method === '' ? null : (method as MethodCode),
      procedureLead: emptyToNull(lead)
    }
  }

  async function submit(event: SyntheticEvent): Promise<void> {
    event.preventDefault()
    const request = buildRequest()
    if (typeof request === 'string') {
      setError(request)
      return
    }
    setPending(true)
    setError(null)
    try {
      unwrap(await window.api.savePpmLine(request))
      onSaved()
    } catch (failure) {
      setError(messageOf(failure))
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <PageHeader
        title={line ? 'Modifier la ligne' : 'Nouvelle ligne du plan'}
        description="Seul l’objet est obligatoire : le reste peut être complété au fil de l’élaboration du plan."
      />

      <form onSubmit={(event) => void submit(event)}>
        <section className="panel">
          <h2 className="panel__title">Description du marché</h2>

          <label htmlFor="line-nature">Nature du marché</label>
          <select
            id="line-nature"
            value={nature}
            onChange={(event) => {
              setNature(event.target.value)
            }}
          >
            {NATURE_CODES.map((code) => (
              <option key={code} value={code}>
                {NATURE_LABELS[code]}
              </option>
            ))}
          </select>

          <label htmlFor="line-object">Objet</label>
          <textarea
            id="line-object"
            rows={3}
            value={object}
            onChange={(event) => {
              setObject(event.target.value)
            }}
            required
          />

          <div className="form-row">
            <div>
              <label htmlFor="line-financing">Financement</label>
              <input
                id="line-financing"
                type="text"
                value={financing}
                onChange={(event) => {
                  setFinancing(event.target.value)
                }}
              />
            </div>
            <div>
              <label htmlFor="line-accounts">Comptes (séparés par une virgule)</label>
              <input
                id="line-accounts"
                type="text"
                value={accounts}
                onChange={(event) => {
                  setAccounts(event.target.value)
                }}
              />
            </div>
          </div>

          <div className="form-row">
            <div>
              <label htmlFor="line-method">Mode de passation</label>
              <select
                id="line-method"
                value={method}
                onChange={(event) => {
                  setMethod(event.target.value)
                }}
              >
                <option value="">Non défini</option>
                {METHOD_CODES.map((code) => (
                  <option key={code} value={code}>
                    {METHOD_LABELS[code]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="line-lead">Responsable de la conduite de la procédure</label>
              <input
                id="line-lead"
                type="text"
                value={lead}
                onChange={(event) => {
                  setLead(event.target.value)
                }}
              />
            </div>
          </div>
        </section>

        <section className="panel">
          <h2 className="panel__title">Dates prévisionnelles</h2>
          <div className="form-row">
            <div>
              <label htmlFor="line-launch">Lancement</label>
              <input
                id="line-launch"
                type="date"
                value={launch}
                onChange={(event) => {
                  setLaunch(event.target.value)
                }}
              />
            </div>
            <div>
              <label htmlFor="line-opening">Ouverture des plis</label>
              <input
                id="line-opening"
                type="date"
                value={opening}
                onChange={(event) => {
                  setOpening(event.target.value)
                }}
              />
            </div>
            <div>
              <label htmlFor="line-award">Attribution</label>
              <input
                id="line-award"
                type="date"
                value={award}
                onChange={(event) => {
                  setAward(event.target.value)
                }}
              />
            </div>
          </div>
          <p className="hint">Dans l’ordre : lancement, ouverture des plis, puis attribution.</p>
        </section>

        <section className="panel">
          <h2 className="panel__title">Services bénéficiaires et montants (Ar)</h2>
          {beneficiaries.length === 0 && (
            <p className="hint">
              Aucun service ajouté. Le montant de la ligne est la somme des services.
            </p>
          )}
          {beneficiaries.map((beneficiary, index) => (
            <div className="form-row beneficiary-row" key={beneficiary.key}>
              <div>
                <label htmlFor={`service-${beneficiary.key}`}>
                  Service bénéficiaire {index + 1}
                </label>
                <input
                  id={`service-${beneficiary.key}`}
                  type="text"
                  value={beneficiary.service}
                  onChange={(event) => {
                    updateBeneficiary(beneficiary.key, { service: event.target.value })
                  }}
                />
              </div>
              <div>
                <label htmlFor={`amount-${beneficiary.key}`}>
                  Montant du service {index + 1} (Ar)
                </label>
                <input
                  id={`amount-${beneficiary.key}`}
                  type="text"
                  inputMode="numeric"
                  value={beneficiary.amount}
                  onChange={(event) => {
                    updateBeneficiary(beneficiary.key, { amount: event.target.value })
                  }}
                />
              </div>
              <button
                type="button"
                className="secondary danger-outline"
                aria-label={`Retirer le service ${index + 1}`}
                onClick={() => {
                  setBeneficiaries((current) =>
                    current.filter((item) => item.key !== beneficiary.key)
                  )
                }}
              >
                <Icon name="trash" size={16} />
                Retirer
              </button>
            </div>
          ))}
          <div className="actions" style={{ marginTop: '1rem' }}>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setBeneficiaries((current) => [
                  ...current,
                  { key: nextKey, service: '', amount: '' }
                ])
                setNextKey(nextKey + 1)
              }}
            >
              <Icon name="plus" size={16} />
              Ajouter un service
            </button>
          </div>
          <p role="status" className="total">
            Montant total de la ligne : {formatAriary(runningTotal)}
          </p>
        </section>

        {error && <Alert tone="error">{error}</Alert>}

        <div className="actions" style={{ marginTop: '1.5rem' }}>
          <button type="submit" disabled={pending}>
            <Icon name="check" size={16} />
            {pending ? 'Enregistrement…' : 'Enregistrer la ligne'}
          </button>
          <button type="button" className="secondary" onClick={onCancel}>
            Annuler
          </button>
        </div>
      </form>
    </>
  )
}
