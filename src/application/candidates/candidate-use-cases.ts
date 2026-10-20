import { type Candidate, createCandidate, normalizeNif } from '@domain/candidate'
import type { CandidateRepository } from '@domain/repositories'
import { DomainError } from '@domain/shared/errors'
import type { IdGenerator } from '@domain/shared/ports'
import type { RegionRepositories } from '../ports'
import type { RegionSession } from '../region-session'

export interface CandidateFields {
  readonly name: string
  readonly nif: string | null
  readonly stat: string | null
  readonly address: string | null
  readonly phone: string | null
  readonly email: string | null
}

export interface CandidateView extends CandidateFields {
  readonly id: string
  /** Nombre d'offres déposées par ce candidat, toutes procédures confondues. */
  readonly bidCount: number
}

function bidCountOf(repositories: RegionRepositories, candidateId: string): number {
  return repositories.procedures
    .list()
    .reduce(
      (total, procedure) =>
        total + procedure.bids.filter((bid) => bid.candidateId === candidateId).length,
      0
    )
}

function toView(repositories: RegionRepositories, candidate: Candidate): CandidateView {
  return { ...candidate, bidCount: bidCountOf(repositories, candidate.id) }
}

/** Deux candidats ne peuvent pas porter le même NIF (espaces et casse ignorés) ; un NIF vide n'est pas comparé. */
function assertNifAvailable(
  candidates: CandidateRepository,
  nif: string | null,
  exceptCandidateId: string | null
): void {
  if (nif === null) return
  const wanted = normalizeNif(nif)
  const taken = candidates
    .list()
    .some(
      (existing) =>
        existing.id !== exceptCandidateId &&
        existing.nif !== null &&
        normalizeNif(existing.nif) === wanted
    )
  if (taken) {
    throw new DomainError(
      'DUPLICATE_NIF',
      `Un candidat est déjà enregistré avec le NIF « ${nif.trim()} ».`
    )
  }
}

function requireCandidate(candidates: CandidateRepository, candidateId: string): Candidate {
  const candidate = candidates.findById(candidateId)
  if (candidate === null) {
    throw new DomainError('CANDIDATE_NOT_FOUND', 'Ce candidat n’existe pas.')
  }
  return candidate
}

/** Candidats de la région ouverte, par ordre alphabétique. */
export class ListCandidatesUseCase {
  constructor(private readonly session: RegionSession) {}

  execute(): readonly CandidateView[] {
    const { repositories } = this.session.requireWorkspace()
    return repositories.candidates.list().map((candidate) => toView(repositories, candidate))
  }
}

export class CreateCandidateUseCase {
  constructor(
    private readonly session: RegionSession,
    private readonly ids: IdGenerator
  ) {}

  execute(input: CandidateFields): CandidateView {
    const { repositories } = this.session.requireWorkspace()
    const candidate = createCandidate({ id: this.ids.newId(), ...input })
    assertNifAvailable(repositories.candidates, candidate.nif, null)
    repositories.candidates.save(candidate)
    return toView(repositories, candidate)
  }
}

export class UpdateCandidateUseCase {
  constructor(private readonly session: RegionSession) {}

  execute(input: CandidateFields & { readonly candidateId: string }): CandidateView {
    const { repositories } = this.session.requireWorkspace()
    const current = requireCandidate(repositories.candidates, input.candidateId)
    const updated = createCandidate({ ...input, id: current.id })
    assertNifAvailable(repositories.candidates, updated.nif, updated.id)
    repositories.candidates.save(updated)
    return toView(repositories, updated)
  }
}

/** Supprime un candidat, sauf s'il a déposé une offre ou s'il est titulaire d'un contrat. */
export class DeleteCandidateUseCase {
  constructor(private readonly session: RegionSession) {}

  execute(input: { readonly candidateId: string }): void {
    const { repositories } = this.session.requireWorkspace()
    const candidate = requireCandidate(repositories.candidates, input.candidateId)
    const hasBids = bidCountOf(repositories, candidate.id) > 0
    const holdsContract = repositories.contracts
      .list()
      .some((contract) => contract.holderId === candidate.id)
    if (hasBids || holdsContract) {
      throw new DomainError(
        'CANDIDATE_IN_USE',
        'Ce candidat a déposé une offre ou détient un contrat : il ne peut pas être supprimé.'
      )
    }
    repositories.candidates.delete(candidate.id)
  }
}
