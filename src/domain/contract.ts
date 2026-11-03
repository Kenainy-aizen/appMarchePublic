import { type Ariary, ariary } from './shared/ariary'
import { DomainError } from './shared/errors'
import { type IsoDate, parseIsoDate, parseOptionalIsoDate } from './shared/iso-date'
import { oneOf, optionalText, requiredText } from './shared/text'

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

export const CONTRACT_KIND_LABELS: Readonly<Record<ContractKind, string>> = {
  MARCHE: 'Marché',
  CONVENTION: 'Convention',
  ACHAT_DIRECT: 'Achat direct'
}

export const CONTRACT_EVENT_LABELS: Readonly<Record<ContractEventKind, string>> = {
  ORDRE_SERVICE_DEMARRAGE: 'Ordre de service de démarrage',
  ORDRE_SERVICE_ARRET: 'Ordre de service d’arrêt',
  ORDRE_SERVICE_REPRISE: 'Ordre de service de reprise',
  RECEPTION_PROVISOIRE: 'Réception provisoire',
  RECEPTION_DEFINITIVE: 'Réception définitive',
  AVENANT: 'Avenant',
  CLOTURE: 'Clôture du contrat'
}

export function parseContractKind(value: string): ContractKind {
  return oneOf(value, CONTRACT_KINDS, 'type de contrat')
}

export function parseContractEventKind(value: string): ContractEventKind {
  return oneOf(value, CONTRACT_EVENT_KINDS, 'type d’événement')
}

/** Situation d'exécution, déduite des événements (jamais stockée). */
export type ContractStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'STOPPED'
  | 'PROVISIONALLY_RECEIVED'
  | 'FINALLY_RECEIVED'
  | 'CLOSED'

export const CONTRACT_STATUS_LABELS: Readonly<Record<ContractStatus, string>> = {
  NOT_STARTED: 'Non démarré',
  IN_PROGRESS: 'En cours d’exécution',
  STOPPED: 'Arrêté',
  PROVISIONALLY_RECEIVED: 'Reçu provisoirement',
  FINALLY_RECEIVED: 'Reçu définitivement',
  CLOSED: 'Clôturé'
}

export function contractStatus(contract: Contract): ContractStatus {
  const has = (kind: ContractEventKind): boolean =>
    contract.events.some((event) => event.kind === kind)
  if (has('CLOTURE')) return 'CLOSED'
  if (has('RECEPTION_DEFINITIVE')) return 'FINALLY_RECEIVED'
  if (has('RECEPTION_PROVISOIRE')) return 'PROVISIONALLY_RECEIVED'
  const lastOrder = contract.events.filter((event) => event.kind.startsWith('ORDRE_SERVICE')).at(-1)
  if (lastOrder === undefined) return 'NOT_STARTED'
  return lastOrder.kind === 'ORDRE_SERVICE_ARRET' ? 'STOPPED' : 'IN_PROGRESS'
}

/**
 * Événements enregistrables à l'étape actuelle (ADR-029). Aucun sans date de signature.
 * Les avenants ne sont plus possibles une fois la réception provisoire prononcée.
 */
export function allowedEventKinds(contract: Contract): readonly ContractEventKind[] {
  if (contract.signedOn === null) return []
  switch (contractStatus(contract)) {
    case 'NOT_STARTED':
      return ['ORDRE_SERVICE_DEMARRAGE', 'AVENANT']
    case 'IN_PROGRESS':
      return ['ORDRE_SERVICE_ARRET', 'RECEPTION_PROVISOIRE', 'AVENANT']
    case 'STOPPED':
      return ['ORDRE_SERVICE_REPRISE', 'AVENANT']
    case 'PROVISIONALLY_RECEIVED':
      return ['RECEPTION_DEFINITIVE']
    case 'FINALLY_RECEIVED':
      return ['CLOTURE']
    case 'CLOSED':
      return []
  }
}

export interface ContractEventInput {
  readonly id: string
  readonly kind: ContractEventKind
  readonly occurredOn: string
  readonly amountDelta?: number | null
  readonly note?: string | null
}

/** Ajoute un événement d'exécution en respectant la succession (ADR-029). */
export function addContractEvent(contract: Contract, input: ContractEventInput): Contract {
  if (contract.signedOn === null) {
    throw new DomainError(
      'SIGNATURE_REQUIRED',
      'Renseignez la date de signature du contrat avant d’enregistrer un événement.'
    )
  }
  const event = createContractEvent(input)
  const status = contractStatus(contract)
  if (status === 'CLOSED') {
    throw new DomainError(
      'CONTRACT_CLOSED',
      'Le contrat est clôturé : plus aucun événement possible.'
    )
  }
  if (!allowedEventKinds(contract).includes(event.kind)) {
    throw new DomainError(
      'EVENT_NOT_ALLOWED',
      `« ${CONTRACT_EVENT_LABELS[event.kind]} » n’est pas possible à ce stade (${CONTRACT_STATUS_LABELS[status]}).`
    )
  }
  if (event.occurredOn < contract.signedOn) {
    throw new DomainError(
      'EVENT_DATE_BEFORE_SIGNATURE',
      'La date de l’événement ne peut pas précéder la date de signature du contrat.'
    )
  }
  const last = contract.events.at(-1)
  if (last !== undefined && event.occurredOn < last.occurredOn) {
    throw new DomainError(
      'EVENT_DATE_BEFORE_PREVIOUS',
      `La date de l’événement ne peut pas précéder celle de l’événement précédent (${CONTRACT_EVENT_LABELS[last.kind]}).`
    )
  }
  if (event.kind === 'AVENANT' && Number(currentAmount(contract)) + (event.amountDelta ?? 0) < 0) {
    throw new DomainError(
      'AMOUNT_BELOW_ZERO',
      'Cet avenant ramènerait le montant du contrat sous zéro.'
    )
  }
  return { ...contract, events: [...contract.events, event] }
}

/** Annule le dernier événement enregistré (correction d'une erreur de saisie). */
export function removeLastContractEvent(contract: Contract): Contract {
  if (contract.events.length === 0) {
    throw new DomainError('NO_EVENT', 'Aucun événement à annuler.')
  }
  return { ...contract, events: contract.events.slice(0, -1) }
}

export interface ContractDetailsInput {
  readonly reference: string
  readonly object: string
  readonly holderId: string
  readonly ppmLineId: string | null
  readonly amount: Ariary
  readonly signedOn: string | null
}

/** Modifie l'en-tête. Le montant initial et la date de signature se figent dès le premier événement. */
export function updateContractDetails(contract: Contract, input: ContractDetailsInput): Contract {
  const signedOn = parseOptionalIsoDate(input.signedOn)
  if (
    contract.events.length > 0 &&
    (input.amount !== contract.amount || signedOn !== contract.signedOn)
  ) {
    throw new DomainError(
      'CONTRACT_STARTED',
      'Le montant et la date de signature ne peuvent plus être modifiés : des événements sont déjà enregistrés.'
    )
  }
  return {
    ...contract,
    reference: requiredText(input.reference, 'référence'),
    object: requiredText(input.object, 'objet'),
    holderId: requiredText(input.holderId, 'titulaire'),
    ppmLineId: input.ppmLineId,
    amount: input.amount,
    signedOn
  }
}
