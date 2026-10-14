import type { Ppm } from '@domain/ppm'
import type { PpmRepository } from '@domain/repositories'
import { DomainError } from '@domain/shared/errors'
import type { RegionRepositories } from '../ports'

export function requirePpm(ppms: PpmRepository, ppmId: string): Ppm {
  const ppm = ppms.findById(ppmId)
  if (ppm === null) {
    throw new DomainError('PPM_NOT_FOUND', 'Ce plan de passation n’existe pas.')
  }
  return ppm
}

/**
 * Une ligne du plan ne peut pas disparaître tant qu'une procédure ou un contrat s'y rattache :
 * le lien serait perdu silencieusement.
 */
export function assertLinesNotInUse(
  repositories: RegionRepositories,
  lineIds: readonly string[],
  subject: 'line' | 'plan'
): void {
  const ids = new Set(lineIds)
  const isUsed = (lineId: string | null): boolean => lineId !== null && ids.has(lineId)
  const inUse =
    repositories.procedures.list().some((procedure) => isUsed(procedure.ppmLineId)) ||
    repositories.contracts.list().some((contract) => isUsed(contract.ppmLineId))
  if (inUse) {
    throw new DomainError(
      'PPM_LINE_IN_USE',
      subject === 'line'
        ? 'Cette ligne est utilisée par une procédure ou un contrat : elle ne peut pas être supprimée.'
        : 'Ce plan contient des lignes utilisées par des procédures ou des contrats : il ne peut pas être supprimé.'
    )
  }
}
