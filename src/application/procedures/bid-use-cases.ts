import { addBid, createBid, removeBid, setAwardedBid, updateBidAmount } from '@domain/procedure'
import { ariary } from '@domain/shared/ariary'
import { DomainError } from '@domain/shared/errors'
import type { IdGenerator } from '@domain/shared/ports'
import type { RegionSession } from '../region-session'
import { detailOf, requireProcedure } from './procedure-access'
import type { ProcedureDetailView } from './views'

type Procedure = ReturnType<typeof requireProcedure>

/** Charge la procédure, applique une règle du domaine, enregistre et renvoie la vue mise à jour. */
function applyToProcedure(
  session: RegionSession,
  procedureId: string,
  change: (procedure: Procedure, candidateIds: ReadonlySet<string>) => Procedure
): ProcedureDetailView {
  const { repositories } = session.requireWorkspace()
  const candidateIds = new Set(repositories.candidates.list().map((candidate) => candidate.id))
  const updated = change(requireProcedure(repositories.procedures, procedureId), candidateIds)
  repositories.procedures.save(updated)
  return detailOf(repositories, updated)
}

/** Enregistre l'offre d'un candidat connu ; un candidat ne dépose qu'une offre par procédure. */
export class AddBidUseCase {
  constructor(
    private readonly session: RegionSession,
    private readonly ids: IdGenerator
  ) {}

  execute(input: {
    readonly procedureId: string
    readonly candidateId: string
    readonly amount: number
  }): ProcedureDetailView {
    return applyToProcedure(this.session, input.procedureId, (procedure, candidateIds) => {
      if (!candidateIds.has(input.candidateId)) {
        throw new DomainError('CANDIDATE_NOT_FOUND', 'Ce candidat n’existe pas.')
      }
      return addBid(
        procedure,
        createBid({
          id: this.ids.newId(),
          candidateId: input.candidateId,
          amount: ariary(input.amount)
        })
      )
    })
  }
}

export class UpdateBidUseCase {
  constructor(private readonly session: RegionSession) {}

  execute(input: {
    readonly procedureId: string
    readonly bidId: string
    readonly amount: number
  }): ProcedureDetailView {
    return applyToProcedure(this.session, input.procedureId, (procedure) =>
      updateBidAmount(procedure, input.bidId, ariary(input.amount))
    )
  }
}

export class RemoveBidUseCase {
  constructor(private readonly session: RegionSession) {}

  execute(input: { readonly procedureId: string; readonly bidId: string }): ProcedureDetailView {
    return applyToProcedure(this.session, input.procedureId, (procedure) =>
      removeBid(procedure, input.bidId)
    )
  }
}

/** Désigne l'offre retenue (une seule) ; `bidId` = null retire la désignation. */
export class SetAwardUseCase {
  constructor(private readonly session: RegionSession) {}

  execute(input: {
    readonly procedureId: string
    readonly bidId: string | null
  }): ProcedureDetailView {
    return applyToProcedure(this.session, input.procedureId, (procedure) =>
      setAwardedBid(procedure, input.bidId)
    )
  }
}
