import type { RegionRepositories, RegionWorkspace } from '@application/ports'
import { RegionSession } from '@application/region-session'
import type { Candidate } from '@domain/candidate'
import type { Contract } from '@domain/contract'
import type { Ppm } from '@domain/ppm'
import type { Procedure } from '@domain/procedure'
import type {
  CandidateRepository,
  ContractRepository,
  PpmRepository,
  ProcedureRepository
} from '@domain/repositories'

class InMemoryStore<T extends { readonly id: string }> {
  protected readonly items = new Map<string, T>()
  save(item: T): void {
    this.items.set(item.id, item)
  }
  findById(id: string): T | null {
    return this.items.get(id) ?? null
  }
  list(): readonly T[] {
    return [...this.items.values()]
  }
  delete(id: string): void {
    this.items.delete(id)
  }
}

export class InMemoryPpmRepository extends InMemoryStore<Ppm> implements PpmRepository {
  nextNumber(year: number): number {
    const numbers = this.list()
      .filter((ppm) => ppm.year === year)
      .map((ppm) => ppm.number)
    return Math.max(0, ...numbers) + 1
  }
  /** Comme la base : du plus récent au plus ancien. */
  override list(): readonly Ppm[] {
    return [...super.list()].sort((a, b) => b.year - a.year || b.number - a.number)
  }
}

export class InMemoryProcedureRepository
  extends InMemoryStore<Procedure>
  implements ProcedureRepository {}
export class InMemoryContractRepository
  extends InMemoryStore<Contract>
  implements ContractRepository {}
export class InMemoryCandidateRepository
  extends InMemoryStore<Candidate>
  implements CandidateRepository {}

export interface ActiveRegion {
  readonly session: RegionSession
  readonly repositories: {
    readonly ppms: InMemoryPpmRepository
    readonly procedures: InMemoryProcedureRepository
    readonly contracts: InMemoryContractRepository
    readonly candidates: InMemoryCandidateRepository
  }
}

/** Une session avec une région « ouverte » dont les dépôts sont en mémoire. */
export function openFakeRegion(regionId = 'region-1'): ActiveRegion {
  const repositories = {
    ppms: new InMemoryPpmRepository(),
    procedures: new InMemoryProcedureRepository(),
    contracts: new InMemoryContractRepository(),
    candidates: new InMemoryCandidateRepository()
  }
  const workspace: RegionWorkspace = {
    regionId,
    repositories: repositories satisfies RegionRepositories,
    close: () => undefined
  }
  const session = new RegionSession()
  session.activate({ id: regionId, name: 'Région test' }, workspace)
  return { session, repositories }
}
