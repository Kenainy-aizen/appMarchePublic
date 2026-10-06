import { MAX_REGIONS, type RegionSummary, suggestRegionName } from '@domain/region'
import type { RegionRegistry } from '../ports'

export interface RegionsOverview {
  readonly regions: readonly RegionSummary[]
  readonly canCreate: boolean
  /** Nom proposé par défaut pour la prochaine région (modifiable par l'utilisateur). */
  readonly suggestedName: string
}

/** Liste les régions déjà créées. Ne renvoie jamais de secret. */
export class ListRegionsUseCase {
  constructor(private readonly registry: RegionRegistry) {}

  execute(): RegionsOverview {
    const regions = this.registry.list().map(({ id, name }): RegionSummary => ({ id, name }))
    return {
      regions,
      canCreate: regions.length < MAX_REGIONS,
      suggestedName: suggestRegionName(regions.map((region) => region.name))
    }
  }
}
