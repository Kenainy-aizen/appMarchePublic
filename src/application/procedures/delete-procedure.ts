import { DomainError } from '@domain/shared/errors'
import type { RegionSession } from '../region-session'
import { removeAttachmentsOf } from '../attachments/attachment-access'
import { requireProcedure } from './procedure-access'

/** Supprime une procédure (avec ses étapes et ses offres), sauf si un contrat s'y rattache. */
export class DeleteProcedureUseCase {
  constructor(private readonly session: RegionSession) {}

  execute(input: { readonly procedureId: string }): void {
    const workspace = this.session.requireWorkspace()
    const { repositories } = workspace
    const procedure = requireProcedure(repositories.procedures, input.procedureId)
    if (repositories.contracts.list().some((contract) => contract.procedureId === procedure.id)) {
      throw new DomainError(
        'PROCEDURE_IN_USE',
        'Cette procédure est liée à un contrat : elle ne peut pas être supprimée.'
      )
    }
    repositories.procedures.delete(procedure.id)
    removeAttachmentsOf(workspace, 'PROCEDURE', procedure.id)
  }
}
