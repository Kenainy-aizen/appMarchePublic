import { MAX_REGIONS, type RegionSummary, suggestRegionName } from '@domain/region'
import type { OrganizationSettings, RegionRegistry } from '../ports'

export interface RegionsOverview {
  /** Nom de la PRMP, ou null tant qu'il n'a pas été renseigné. */
  readonly organizationName: string | null
  readonly regions: readonly RegionSummary[]
  readonly canCreate: boolean
  /** Nom proposé par défaut pour la prochaine région (modifiable par l'utilisateur). */
  readonly suggestedName: string
}

/** Liste les régions déjà créées et le nom de la PRMP. Ne renvoie jamais de secret. */
export class ListRegionsUseCase {
  constructor(
    private readonly registry: RegionRegistry,
    private readonly settings: OrganizationSettings
  ) {}

  execute(): RegionsOverview {
    const regions = this.registry.list().map(({ id, name }): RegionSummary => ({ id, name }))
    return {
      organizationName: this.settings.getName(),
      regions,
      canCreate: regions.length < MAX_REGIONS,
      suggestedName: suggestRegionName(regions.map((region) => region.name))
    }
  }
}
