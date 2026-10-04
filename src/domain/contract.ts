import { type Ariary, ariary } from './shared/ariary'
import { DomainError } from './shared/errors'
import { type IsoDate, parseIsoDate, parseOptionalIsoDate } from './shared/iso-date'
import { optionalText, requiredText } from './shared/text'

export const CONTRACT_KINDS = ['MARCHE', 'CONVENTION', 'ACHAT_DIRECT'] as const
export type ContractKind = (typeof CONTRACT_KINDS)[number]

export const CONTRACT_EVENT_KINDS = [
  'ORDRE_SERVICE_DEMARRAGE',
  'ORDRE_SERVICE_ARRET',
  'ORDRE_SERVICE_REPRISE',
  'RECEPTION_PROVISOIRE',
  'RECEPTION_DEFINITIVE',
  'AVENANT',
  'CLOTURE'
] as const
export type ContractEventKind = (typeof CONTRACT_EVENT_KINDS)[number]

export interface ContractEvent {
  readonly id: string
  readonly kind: ContractEventKind
  readonly occurredOn: IsoDate
  /** Variation de montant, uniquement pour un avenant (peut être négative). */
  readonly amountDelta: number | null
  readonly note: string | null
}

export interface Contract {
  readonly id: string
  readonly reference: string
  readonly kind: ContractKind
  readonly procedureId: string | null
  readonly ppmLineId: string | null
  readonly holderId: string
  readonly object: string
  readonly amount: Ariary
  readonly signedOn: IsoDate | null
  readonly events: readonly ContractEvent[]
}

export interface ContractInput {
  readonly id: string
  readonly reference: string
  readonly kind: ContractKind
  readonly procedureId?: string | null
  readonly ppmLineId?: string | null
  readonly holderId: string
  readonly object: string
  readonly amount: Ariary
  readonly signedOn?: string | null
}

export function createContract(input: ContractInput): Contract {
  const procedureId = input.procedureId ?? null
  if (input.kind === 'MARCHE' && procedureId === null) {
    throw new DomainError(
      'PROCEDURE_REQUIRED',
      'Un marché doit être rattaché à une procédure de passation.'
    )
  }
  return {
    id: requiredText(input.id, 'identifiant'),
    reference: requiredText(input.reference, 'référence'),
    kind: input.kind,
    procedureId,
    ppmLineId: input.ppmLineId ?? null,
    holderId: requiredText(input.holderId, 'titulaire'),
    object: requiredText(input.object, 'objet'),
    amount: input.amount,
    signedOn: parseOptionalIsoDate(input.signedOn ?? null),
    events: []
  }
}

export function createContractEvent(input: {
  readonly id: string
  readonly kind: ContractEventKind
  readonly occurredOn: string
  readonly amountDelta?: number | null
  readonly note?: string | null
}): ContractEvent {
  const amountDelta = input.amountDelta ?? null
  if (input.kind === 'AVENANT' && amountDelta === null) {
    throw new DomainError(
      'AMOUNT_DELTA_REQUIRED',
      'Un avenant doit préciser la variation de montant.'
    )
  }
  if (amountDelta !== null && !Number.isSafeInteger(amountDelta)) {
    throw new DomainError('INVALID_AMOUNT', 'La variation de montant doit être un entier.')
  }
  return {
    id: requiredText(input.id, 'identifiant'),
    kind: input.kind,
    occurredOn: parseIsoDate(input.occurredOn),
    amountDelta: input.kind === 'AVENANT' ? amountDelta : null,
    note: optionalText(input.note ?? null)
  }
}

/** Montant actuel = montant initial + somme des avenants. */
export function currentAmount(contract: Contract): Ariary {
  const total = contract.events.reduce<number>(
    (sum, event) => sum + (event.amountDelta ?? 0),
    contract.amount
  )
  return ariary(total)
}
