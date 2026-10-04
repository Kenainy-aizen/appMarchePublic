import type { Candidate } from './candidate'
import type { Contract } from './contract'
import type { Ppm } from './ppm'
import type { Procedure } from './procedure'

/**
 * Ports de persistance. Chaque agrégat est sauvegardé en entier (`save` = création ou remplacement).
 * Les implémentations opèrent TOUJOURS sur la base de la région active : le domaine ne connaît pas
 * la notion de région.
 */
export interface PpmRepository {
  /** Prochain numéro de PPM pour l'année (numérotation automatique). */
  nextNumber(year: number): number
  save(ppm: Ppm): void
  findById(id: string): Ppm | null
  list(): readonly Ppm[]
  delete(id: string): void
}

export interface ProcedureRepository {
  save(procedure: Procedure): void
  findById(id: string): Procedure | null
  list(): readonly Procedure[]
  delete(id: string): void
}

export interface CandidateRepository {
  save(candidate: Candidate): void
  findById(id: string): Candidate | null
  list(): readonly Candidate[]
  delete(id: string): void
}

export interface ContractRepository {
  save(contract: Contract): void
  findById(id: string): Contract | null
  list(): readonly Contract[]
  delete(id: string): void
}
