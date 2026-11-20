import type { AttachmentFileStore, RegionRepositories, RegionWorkspace } from '@application/ports'
import { RegionSession } from '@application/region-session'
import type { Attachment, AttachmentOwnerKind } from '@domain/attachment'
import type { Candidate } from '@domain/candidate'
import type { Contract } from '@domain/contract'
import type { Ppm } from '@domain/ppm'
import type { Procedure } from '@domain/procedure'
import { DomainError } from '@domain/shared/errors'
import type {
  AttachmentRepository,
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

export class InMemoryAttachmentRepository
  extends InMemoryStore<Attachment>
  implements AttachmentRepository
{
  listByOwner(ownerKind: AttachmentOwnerKind, ownerId: string): readonly Attachment[] {
    return this.list()
      .filter((item) => item.ownerKind === ownerKind && item.ownerId === ownerId)
      .reverse()
  }
  deleteByOwner(ownerKind: AttachmentOwnerKind, ownerId: string): readonly string[] {
    const ids = this.listByOwner(ownerKind, ownerId).map((item) => item.id)
    ids.forEach((id) => {
      this.delete(id)
    })
    return ids
  }
}

/** Magasin de fichiers en mémoire (pas de chiffrement : il est testé dans l'infrastructure). */
export class InMemoryFileStore implements AttachmentFileStore {
  readonly files = new Map<string, Uint8Array>()
  write(attachmentId: string, bytes: Uint8Array): void {
    this.files.set(attachmentId, bytes)
  }
  read(attachmentId: string): Uint8Array {
    const bytes = this.files.get(attachmentId)
    if (bytes === undefined) {
      throw new DomainError('ATTACHMENT_UNREADABLE', 'Le document est introuvable.')
    }
    return bytes
  }
  delete(attachmentId: string): void {
    this.files.delete(attachmentId)
  }
}

export interface ActiveRegion {
  readonly session: RegionSession
  readonly repositories: {
    readonly ppms: InMemoryPpmRepository
    readonly procedures: InMemoryProcedureRepository
    readonly contracts: InMemoryContractRepository
    readonly candidates: InMemoryCandidateRepository
    readonly attachments: InMemoryAttachmentRepository
  }
  readonly files: InMemoryFileStore
}

/** Une session avec une région « ouverte » dont les dépôts sont en mémoire. */
export function openFakeRegion(regionId = 'region-1'): ActiveRegion {
  const repositories = {
    ppms: new InMemoryPpmRepository(),
    procedures: new InMemoryProcedureRepository(),
    contracts: new InMemoryContractRepository(),
    candidates: new InMemoryCandidateRepository(),
    attachments: new InMemoryAttachmentRepository()
  }
  const files = new InMemoryFileStore()
  const workspace: RegionWorkspace = {
    regionId,
    repositories: repositories satisfies RegionRepositories,
    files,
    close: () => undefined
  }
  const session = new RegionSession()
  session.activate({ id: regionId, name: 'Région test' }, workspace)
  return { session, repositories, files }
}
