import type {
  RegionKeyService,
  RegionRegistry,
  RegionSecrets,
  RegionStorage,
  RegionWorkspace,
  RegisteredRegion
} from '@application/ports'
import { DomainError } from '@domain/shared/errors'
import type { Clock, IdGenerator } from '@domain/shared/ports'

export class InMemoryRegistry implements RegionRegistry {
  readonly regions: RegisteredRegion[] = []
  failOnAdd = false

  list(): readonly RegisteredRegion[] {
    return [...this.regions]
  }
  find(regionId: string): RegisteredRegion | null {
    return this.regions.find((region) => region.id === regionId) ?? null
  }
  add(region: RegisteredRegion): void {
    if (this.failOnAdd) throw new Error('échec simulé du registre')
    this.regions.push(region)
  }
}

/** Faux service de clés : le « secret » est simplement le mot de passe encodé. Suffisant pour tester la logique. */
export class FakeKeyService implements RegionKeyService {
  createSecrets(
    regionId: string,
    password: string
  ): Promise<{ secrets: RegionSecrets; dataKey: Buffer; recoveryKey: string }> {
    const secrets = {
      version: 1,
      kdf: { algorithm: 'scrypt', n: 1, r: 1, p: 1, salt: '' },
      passwordWrappedKey: { iv: password, data: '', tag: '' },
      recoverySalt: '',
      recoveryWrappedKey: { iv: '', data: '', tag: '' }
    } satisfies RegionSecrets
    return Promise.resolve({
      secrets,
      dataKey: Buffer.alloc(32, 1),
      recoveryKey: `RECOVERY-${regionId.slice(0, 4)}`
    })
  }
  unlockWithPassword(_regionId: string, secrets: RegionSecrets, password: string): Promise<Buffer> {
    return secrets.passwordWrappedKey.iv === password
      ? Promise.resolve(Buffer.alloc(32, 1))
      : Promise.reject(new DomainError('INVALID_PASSWORD', 'Mot de passe incorrect.'))
  }
  unlockWithRecoveryKey(): Buffer {
    throw new Error('non utilisé dans ces tests')
  }
}

export class FakeStorage implements RegionStorage {
  readonly created: string[] = []
  readonly removed: string[] = []
  readonly opened: FakeWorkspace[] = []
  failOnCreate = false
  missing = false

  create(regionId: string): void {
    if (this.failOnCreate) throw new Error('échec simulé de la création')
    this.created.push(regionId)
  }
  open(regionId: string): RegionWorkspace {
    if (this.missing) throw new DomainError('REGION_DATA_MISSING', 'Fichier introuvable.')
    const workspace = new FakeWorkspace(regionId)
    this.opened.push(workspace)
    return workspace
  }
  remove(regionId: string): void {
    this.removed.push(regionId)
  }
}

export class FakeWorkspace implements RegionWorkspace {
  closed = false
  readonly repositories = {} as RegionWorkspace['repositories']
  constructor(readonly regionId: string) {}
  close(): void {
    this.closed = true
  }
}

export class SequentialIds implements IdGenerator {
  private counter = 0
  newId(): string {
    this.counter += 1
    return `id-${this.counter}`
  }
}

export class FakeClock implements Clock {
  ms = 1_000_000
  today(): string {
    return '2026-10-04'
  }
  nowMs(): number {
    return this.ms
  }
}
