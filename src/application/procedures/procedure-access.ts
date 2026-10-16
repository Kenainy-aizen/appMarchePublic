import type { Ppm } from '@domain/ppm'
import type { Procedure } from '@domain/procedure'
import type { ProcedureRepository } from '@domain/repositories'
import { DomainError } from '@domain/shared/errors'
import type { RegionRepositories } from '../ports'

export function requireProcedure(procedures: ProcedureRepository, procedureId: string): Procedure {
  const procedure = procedures.findById(procedureId)
  if (procedure === null) {
    throw new DomainError('PROCEDURE_NOT_FOUND', 'Cette procédure n’existe pas.')
  }
  return procedure
}

const normalize = (reference: string): string => reference.trim().toLowerCase()

/** Deux procédures ne peuvent pas porter la même référence (majuscules et espaces ignorés). */
export function assertReferenceAvailable(
  procedures: ProcedureRepository,
  reference: string,
  exceptProcedureId: string | null
): void {
  const taken = procedures
    .list()
    .some(
      (existing) =>
        existing.id !== exceptProcedureId && normalize(existing.reference) === normalize(reference)
    )
  if (taken) {
    throw new DomainError(
      'DUPLICATE_REFERENCE',
      `Une procédure porte déjà la référence « ${reference.trim()} ».`
    )
  }
}

export function assertPpmLineExists(ppms: readonly Ppm[], lineId: string | null): void {
  if (lineId === null) return
  if (!ppms.some((ppm) => ppm.lines.some((line) => line.id === lineId))) {
    throw new DomainError('PPM_LINE_NOT_FOUND', 'La ligne du plan choisie n’existe pas.')
  }
}

export function ppmsOf(repositories: RegionRepositories): readonly Ppm[] {
  return repositories.ppms.list()
}
