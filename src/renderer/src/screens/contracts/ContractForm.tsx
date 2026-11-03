import { useEffect, useState, type SyntheticEvent } from 'react'
import type {
  CandidateDto,
  ContractableProcedureDto,
  ContractDetailDto,
  PpmLineChoiceDto
} from '@shared/api'
import {
  CONTRACT_KIND_CODES,
  CONTRACT_KIND_LABELS,
  type ContractKindCode
} from '@shared/contract-options'
import { messageOf, unwrap } from '../../api-errors'
import { emptyToNull, formatAmount, formatAriary, parseAmount } from '../../format'
import { Alert } from '../../ui/Alert'
import { Icon } from '../../ui/Icon'
import { PageHeader } from '../../ui/PageHeader'

interface Props {
  /** null = nouveau contrat ; sinon modification de l'en-tête. */
  readonly contract: ContractDetailDto | null
  /** Procédure à préselectionner (création d'un marché depuis la page d'une procédure). */
  readonly initialProcedureId: string | null
  readonly onSaved: (contractId: string) => void
  readonly onCancel: () => void
}

const lineLabel = (line: PpmLineChoiceDto): string =>
  `Plan n° ${line.ppmNumber} (${line.ppmYear}) : ${line.object} — ${formatAriary(line.total)}`

export function ContractForm({
  contract,
  initialProcedureId,
  onSaved,
  onCancel
}: Props): React.JSX.Element {
  const editing = contract !== null
  const [procedures, setProcedures] = useState<readonly ContractableProcedureDto[]>([])
  const [candidates, setCandidates] = useState<readonly CandidateDto[]>([])
  const [lines, setLines] = useState<readonly PpmLineChoiceDto[]>([])
  const [kind, setKind] = useState<string>(contract?.kind ?? 'MARCHE')
  const [procedureId, setProcedureId] = useState(initialProcedureId ?? '')
  const [holderId, setHolderId] = useState(contract?.holderId ?? '')
  const [lineId, setLineId] = useState(contract?.ppmLine?.lineId ?? '')
  const [reference, setReference] = useState(contract?.reference ?? '')
  const [object, setObject] = useState(contract?.object ?? '')
  const [amount, setAmount] = useState(contract ? formatAmount(contract.amount) : '')
  const [signedOn, setSignedOn] = useState(contract?.signedOn ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const isMarche = kind === 'MARCHE'
  const locked = contract?.headerLocked === true
  const selectedProcedure = procedures.find((procedure) => procedure.id === procedureId)

  /** Choisir une procédure préremplit le formulaire avec l'attributaire et le montant de son offre. */
  function applyProcedure(choice: ContractableProcedureDto): void {
    setProcedureId(choice.id)
    setHolderId(choice.holderId)
    setLineId(choice.ppmLineId ?? '')
    setObject((current) => (current.trim() === '' ? choice.object : current))
    setAmount((current) => (current.trim() === '' ? formatAmount(choice.amount) : current))
  }

  useEffect(() => {
    const alive = { current: true }
    void (async () => {
      try {
        const [contractable, people, planLines] = await Promise.all([
          window.api.listContractableProcedures(),
          window.api.listCandidates(),
          window.api.listPpmLines()
        ])
        if (!alive.current) return
        const available = unwrap(contractable)
        setProcedures(available)
        setCandidates(unwrap(people))
        setLines(unwrap(planLines))
        const initial = available.find((procedure) => procedure.id === initialProcedureId)
        if (initial && !contract) applyProcedure(initial)
      } catch (failure) {
        if (alive.current) setError(messageOf(failure))
      }
    })()
    return () => {
      alive.current = false
    }
    // Chargement unique des listes ; `applyProcedure` ne dépend que de setters stables.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function submit(event: SyntheticEvent): Promise<void> {
    event.preventDefault()
    const parsedAmount = parseAmount(amount)
    if (parsedAmount === null) {
      setError('Le montant est invalide : saisissez un nombre entier (par exemple 1 500 000).')
      return
    }
    setPending(true)
    setError(null)
    try {
      const common = {
        reference,
        object,
        holderId: isMarche && !editing ? (selectedProcedure?.holderId ?? '') : holderId,
        ppmLineId: lineId === '' ? null : lineId,
        amount: parsedAmount,
        signedOn: emptyToNull(signedOn)
      }
      const saved = unwrap(
        contract
          ? await window.api.updateContract({ ...common, contractId: contract.id })
          : await window.api.createContract({
              ...common,
              kind: kind as ContractKindCode,
              procedureId: isMarche ? (procedureId === '' ? null : procedureId) : null
            })
      )
      onSaved(saved.id)
    } catch (failure) {
      setError(messageOf(failure))
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <PageHeader
        title={editing ? 'Modifier le contrat' : 'Nouveau contrat'}
        description="La référence est unique dans la région. Le marché est toujours attribué à l’attributaire de sa procédure."
      />

      <form className="panel" onSubmit={(event) => void submit(event)}>
        <div className="form-row">
          <div>
            <label htmlFor="ct-kind">Type de contrat</label>
            <select
              id="ct-kind"
              value={kind}
              disabled={editing}
              onChange={(event) => {
                setKind(event.target.value)
                setHolderId('')
                setProcedureId('')
              }}
            >
              {CONTRACT_KIND_CODES.map((code) => (
                <option key={code} value={code}>
                  {CONTRACT_KIND_LABELS[code]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ct-reference">Référence</label>
            <input
              id="ct-reference"
              type="text"
              value={reference}
              maxLength={100}
              onChange={(event) => {
                setReference(event.target.value)
              }}
              required
            />
          </div>
        </div>

        {isMarche && !editing && (
          <>
            <label htmlFor="ct-procedure">Procédure attribuée</label>
            <select
              id="ct-procedure"
              value={procedureId}
              onChange={(event) => {
                const choice = procedures.find((procedure) => procedure.id === event.target.value)
                if (choice) applyProcedure(choice)
                else {
                  setProcedureId('')
                  setHolderId('')
                }
              }}
              required
            >
              <option value="">Choisir une procédure…</option>
              {procedures.map((procedure) => (
                <option key={procedure.id} value={procedure.id}>
                  {procedure.reference} : {procedure.object}
                </option>
              ))}
            </select>
            {procedures.length === 0 ? (
              <p className="hint">
                Aucune procédure attribuée sans marché. Validez d’abord l’attribution d’une
                procédure.
              </p>
            ) : (
              <p className="hint">
                Choisir une procédure préremplit l’objet, le montant de l’offre retenue et la ligne
                du plan.
              </p>
            )}
            <p className="hint">
              Titulaire : <strong>{selectedProcedure?.holderName ?? '—'}</strong> (attributaire de
              la procédure)
            </p>
          </>
        )}

        {isMarche && editing && (
          <p className="hint">
            Procédure d’origine : <strong>{contract.procedure?.reference ?? '—'}</strong>. Titulaire
            : <strong>{contract.holderName}</strong> (non modifiable pour un marché).
          </p>
        )}

        {!isMarche && (
          <>
            <label htmlFor="ct-holder">Titulaire</label>
            <select
              id="ct-holder"
              value={holderId}
              onChange={(event) => {
                setHolderId(event.target.value)
              }}
              required
            >
              <option value="">Choisir un candidat…</option>
              {candidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>
            {candidates.length === 0 && (
              <p className="hint">
                Aucun candidat enregistré : créez le titulaire dans le menu Candidats.
              </p>
            )}
          </>
        )}

        <label htmlFor="ct-object">Objet</label>
        <textarea
          id="ct-object"
          rows={3}
          value={object}
          onChange={(event) => {
            setObject(event.target.value)
          }}
          required
        />

        <div className="form-row">
          <div>
            <label htmlFor="ct-amount">Montant initial (Ar)</label>
            <input
              id="ct-amount"
              type="text"
              inputMode="numeric"
              value={amount}
              disabled={locked}
              onChange={(event) => {
                setAmount(event.target.value)
              }}
              required
            />
          </div>
          <div>
            <label htmlFor="ct-signed">Date de signature</label>
            <input
              id="ct-signed"
              type="date"
              value={signedOn}
              disabled={locked}
              onChange={(event) => {
                setSignedOn(event.target.value)
              }}
            />
          </div>
        </div>
        {locked ? (
          <p className="hint">
            Le montant initial et la date de signature ne peuvent plus être modifiés : des
            événements d’exécution sont enregistrés.
          </p>
        ) : (
          <p className="hint">
            La date de signature est nécessaire pour enregistrer les événements d’exécution.
          </p>
        )}

        <label htmlFor="ct-line">Ligne du plan de passation</label>
        <select
          id="ct-line"
          value={lineId}
          onChange={(event) => {
            setLineId(event.target.value)
          }}
        >
          <option value="">Aucune</option>
          {lines.map((line) => (
            <option key={line.lineId} value={line.lineId}>
              {lineLabel(line)}
            </option>
          ))}
        </select>

        {error && <Alert tone="error">{error}</Alert>}

        <div className="actions" style={{ marginTop: '1.5rem' }}>
          <button type="submit" disabled={pending}>
            <Icon name="check" size={16} />
            {pending
              ? 'Enregistrement…'
              : editing
                ? 'Enregistrer les modifications'
                : 'Créer le contrat'}
          </button>
          <button type="button" className="secondary" onClick={onCancel}>
            Annuler
          </button>
        </div>
      </form>
    </>
  )
}
