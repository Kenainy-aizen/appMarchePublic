import {
  addContractEvent,
  createContract,
  parseContractEventKind,
  parseContractKind,
  removeLastContractEvent,
  updateContractDetails
} from '@domain/contract'
import { ariary } from '@domain/shared/ariary'
import { DomainError } from '@domain/shared/errors'
import type { IdGenerator } from '@domain/shared/ports'
import { removeAttachmentsOf } from '../attachments/attachment-access'
import { isAwarded } from '../procedures/views'
import type { RegionSession } from '../region-session'
import {
  assertContractReferenceAvailable,
  assertHolderExists,
  assertPpmLineExists,
  detailOf,
  requireContract
} from './contract-access'
import {
  listContractableProcedures,
  toSummaryView,
  type ContractableProcedureView,
  type ContractDetailView,
  type ContractSummaryView
} from './views'

export interface ContractFields {
  readonly reference: string
  readonly object: string
  readonly holderId: string
  readonly ppmLineId: string | null
  readonly amount: number
  readonly signedOn: string | null
}

/** Contrats de la région ouverte, par référence. */
export class ListContractsUseCase {
  constructor(private readonly session: RegionSession) {}

  execute(): readonly ContractSummaryView[] {
    const { contracts, candidates } = this.session.requireWorkspace().repositories
    const known = candidates.list()
    return contracts.list().map((contract) => toSummaryView(contract, known))
  }
}

export class GetContractUseCase {
  constructor(private readonly session: RegionSession) {}

  execute(input: { readonly contractId: string }): ContractDetailView {
    const { repositories } = this.session.requireWorkspace()
    return detailOf(repositories, requireContract(repositories.contracts, input.contractId))
  }
}

/** Procédures attribuées qui n'ont pas encore de marché. */
export class ListContractableProceduresUseCase {
  constructor(private readonly session: RegionSession) {}

  execute(): readonly ContractableProcedureView[] {
    const { procedures, contracts, candidates } = this.session.requireWorkspace().repositories
    return listContractableProcedures(procedures.list(), contracts.list(), candidates.list())
  }
}

/**
 * Crée un contrat (ADR-029). Un marché naît d'une procédure dont l'attribution est validée : son titulaire est
 * l'attributaire, et il n'y a qu'un marché par procédure. Une convention ou un achat direct n'ont pas de procédure.
 */
export class CreateContractUseCase {
  constructor(
    private readonly session: RegionSession,
    private readonly ids: IdGenerator
  ) {}

  execute(
    input: ContractFields & { readonly kind: string; readonly procedureId: string | null }
  ): ContractDetailView {
    const { repositories } = this.session.requireWorkspace()
    const kind = parseContractKind(input.kind)

    if (kind === 'MARCHE') {
      const procedure =
        input.procedureId === null ? null : repositories.procedures.findById(input.procedureId)
      if (procedure === null) {
        throw new DomainError(
          'PROCEDURE_NOT_FOUND',
          'Un marché doit être rattaché à une procédure existante.'
        )
      }
      if (!isAwarded(procedure)) {
        throw new DomainError(
          'PROCEDURE_NOT_AWARDED',
          'L’attribution de la procédure doit être validée (avec une offre retenue) avant de créer le marché.'
        )
      }
      const awarded = procedure.bids.find((bid) => bid.awarded)
      if (awarded?.candidateId !== input.holderId) {
        throw new DomainError(
          'HOLDER_MISMATCH',
          'Le titulaire d’un marché est l’attributaire de la procédure.'
        )
      }
      if (repositories.contracts.list().some((contract) => contract.procedureId === procedure.id)) {
        throw new DomainError(
          'PROCEDURE_ALREADY_CONTRACTED',
          'Un marché existe déjà pour cette procédure.'
        )
      }
    } else if (input.procedureId !== null) {
      throw new DomainError(
        'PROCEDURE_NOT_ALLOWED',
        'Seul un marché se rattache à une procédure de passation.'
      )
    }

    const contract = createContract({
      id: this.ids.newId(),
      reference: input.reference,
      kind,
      procedureId: input.procedureId,
      ppmLineId: input.ppmLineId,
      holderId: input.holderId,
      object: input.object,
      amount: ariary(input.amount),
      signedOn: input.signedOn
    })
    assertContractReferenceAvailable(repositories.contracts, contract.reference, null)
    assertHolderExists(repositories, contract.holderId)
    assertPpmLineExists(repositories, contract.ppmLineId)
    repositories.contracts.save(contract)
    return detailOf(repositories, contract)
  }
}

/** Modifie l'en-tête : le titulaire d'un marché reste l'attributaire ; montant et signature se figent au 1er événement. */
export class UpdateContractUseCase {
  constructor(private readonly session: RegionSession) {}

  execute(input: ContractFields & { readonly contractId: string }): ContractDetailView {
    const { repositories } = this.session.requireWorkspace()
    const current = requireContract(repositories.contracts, input.contractId)
    if (current.kind === 'MARCHE' && input.holderId !== current.holderId) {
      throw new DomainError(
        'HOLDER_LOCKED',
        'Le titulaire d’un marché est l’attributaire de la procédure : il ne peut pas être modifié.'
      )
    }
    const updated = updateContractDetails(current, {
      reference: input.reference,
      object: input.object,
      holderId: input.holderId,
      ppmLineId: input.ppmLineId,
      amount: ariary(input.amount),
      signedOn: input.signedOn
    })
    assertContractReferenceAvailable(repositories.contracts, updated.reference, updated.id)
    assertHolderExists(repositories, updated.holderId)
    assertPpmLineExists(repositories, updated.ppmLineId)
    repositories.contracts.save(updated)
    return detailOf(repositories, updated)
  }
}

/** Supprime un contrat qui n'a encore aucun événement d'exécution. */
export class DeleteContractUseCase {
  constructor(private readonly session: RegionSession) {}

  execute(input: { readonly contractId: string }): void {
    const workspace = this.session.requireWorkspace()
    const { repositories } = workspace
    const contract = requireContract(repositories.contracts, input.contractId)
    if (contract.events.length > 0) {
      throw new DomainError(
        'CONTRACT_HAS_EVENTS',
        'Ce contrat a des événements d’exécution : annulez-les d’abord, du plus récent au plus ancien.'
      )
    }
    repositories.contracts.delete(contract.id)
    removeAttachmentsOf(workspace, 'CONTRACT', contract.id)
  }
}

export class AddContractEventUseCase {
  constructor(
    private readonly session: RegionSession,
    private readonly ids: IdGenerator
  ) {}

  execute(input: {
    readonly contractId: string
    readonly kind: string
    readonly occurredOn: string
    readonly amountDelta: number | null
    readonly note: string | null
  }): ContractDetailView {
    const { repositories } = this.session.requireWorkspace()
    const contract = requireContract(repositories.contracts, input.contractId)
    const updated = addContractEvent(contract, {
      id: this.ids.newId(),
      kind: parseContractEventKind(input.kind),
      occurredOn: input.occurredOn,
      amountDelta: input.amountDelta,
      note: input.note
    })
    repositories.contracts.save(updated)
    return detailOf(repositories, updated)
  }
}

export class RemoveLastContractEventUseCase {
  constructor(private readonly session: RegionSession) {}

  execute(input: { readonly contractId: string }): ContractDetailView {
    const { repositories } = this.session.requireWorkspace()
    const updated = removeLastContractEvent(
      requireContract(repositories.contracts, input.contractId)
    )
    repositories.contracts.save(updated)
    return detailOf(repositories, updated)
  }
}
