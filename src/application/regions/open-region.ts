import type { RegionSummary } from '@domain/region'
import { DomainError } from '@domain/shared/errors'
import type { Clock } from '@domain/shared/ports'
import type { LoginThrottle } from '../login-throttle'
import type { RegionKeyService, RegionRegistry, RegionStorage } from '../ports'
import type { RegionSession } from '../region-session'

export interface OpenRegionInput {
  readonly regionId: string
  readonly password: string
}

/**
 * Se connecte à une région avec son mot de passe. Un échec (mot de passe, fichier manquant, limitation
 * d'essais) laisse la région déjà ouverte inchangée ; un succès ferme la précédente.
 */
export class OpenRegionUseCase {
  constructor(
    private readonly registry: RegionRegistry,
    private readonly keys: RegionKeyService,
    private readonly storage: RegionStorage,
    private readonly session: RegionSession,
    private readonly throttle: LoginThrottle,
    private readonly clock: Clock
  ) {}

  async execute(input: OpenRegionInput): Promise<RegionSummary> {
    const region = this.registry.find(input.regionId)
    if (region === null) {
      throw new DomainError('REGION_NOT_FOUND', 'Cette région n’existe pas.')
    }
    this.throttle.assertAllowed(region.id, this.clock.nowMs())

    const dataKey = await this.unlock(region.id, region.secrets, input.password)
    try {
      const workspace = this.storage.open(region.id, dataKey)
      const summary: RegionSummary = { id: region.id, name: region.name }
      this.session.activate(summary, workspace)
      this.throttle.recordSuccess(region.id)
      return summary
    } finally {
      dataKey.fill(0)
    }
  }

  private async unlock(
    regionId: string,
    secrets: Parameters<RegionKeyService['unlockWithPassword']>[1],
    password: string
  ): Promise<Buffer> {
    try {
      return await this.keys.unlockWithPassword(regionId, secrets, password)
    } catch (error) {
      if (error instanceof DomainError && error.code === 'INVALID_PASSWORD') {
        this.throttle.recordFailure(regionId, this.clock.nowMs())
      }
      throw error
    }
  }
}
