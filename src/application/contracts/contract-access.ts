import type { Contract } from '@domain/contract'
import type { ContractRepository } from '@domain/repositories'
import { DomainError } from '@domain/shared/errors'
import type { RegionRepositories } from '../ports'
import { toDetailView, type ContractDetailView } from './views'

export function requireContract(contracts: ContractRepository, contractId: string): Contract {
  const contract = contracts.findById(contractId)
  if (contract === null) {
    throw new DomainError('CONTRACT_NOT_FOUND', 'Ce contrat n’existe pas.')
  }
  return contract
}

const normalize = (reference: string): string => reference.trim().toLowerCase()

/** Deux contrats ne peuvent pas porter la même référence (majuscules et espaces ignorés). */
export function assertContractReferenceAvailable(
  contracts: ContractRepository,
  reference: string,
  exceptContractId: string | null
): void {
  const taken = contracts
    .list()
    .some(
      (existing) =>
        existing.id !== exceptContractId && normalize(existing.reference) === normalize(reference)
    )
  if (taken) {
    throw new DomainError(
      'DUPLICATE_CONTRACT_REFERENCE',
      `Un contrat porte déjà la référence « ${reference.trim()} ».`
    )
  }
}

export function assertHolderExists(repositories: RegionRepositories, holderId: string): void {
  if (repositories.candidates.findById(holderId) === null) {
    throw new DomainError('CANDIDATE_NOT_FOUND', 'Le titulaire choisi n’existe pas.')
  }
}

export function assertPpmLineExists(repositories: RegionRepositories, lineId: string | null): void {
  if (lineId === null) return
  const exists = repositories.ppms
    .list()
    .some((ppm) => ppm.lines.some((line) => line.id === lineId))
  if (!exists) {
    throw new DomainError('PPM_LINE_NOT_FOUND', 'La ligne du plan choisie n’existe pas.')
  }
}

/** Vue détaillée d'un contrat, avec titulaire, procédure d'origine et ligne du plan lus dans la région ouverte. */
export function detailOf(repositories: RegionRepositories, contract: Contract): ContractDetailView {
  return toDetailView(
    contract,
    repositories.candidates.list(),
    repositories.procedures.list(),
    repositories.ppms.list()
  )
}
