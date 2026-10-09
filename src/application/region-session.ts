import { DomainError } from '@domain/shared/errors'
import type { RegionSummary } from '@domain/region'
import type { RegionWorkspace } from './ports'

/**
 * Région actuellement ouverte. C'est le SEUL chemin d'accès aux données métier : les cas d'utilisation
 * demandent leurs dépôts à `requireWorkspace()`, donc ne peuvent jamais toucher une autre région.
 */
export class RegionSession {
  private active: { readonly region: RegionSummary; readonly workspace: RegionWorkspace } | null =
    null

  /** Active une région ; la région précédente est fermée. */
  activate(region: RegionSummary, workspace: RegionWorkspace): void {
    this.close()
    this.active = { region, workspace }
  }

  current(): RegionSummary | null {
    return this.active ? { id: this.active.region.id, name: this.active.region.name } : null
  }

  requireWorkspace(): RegionWorkspace {
    if (!this.active) {
      throw new DomainError(
        'NO_ACTIVE_REGION',
        'Aucune région n’est ouverte. Connectez-vous à une région.'
      )
    }
    return this.active.workspace
  }

  close(): void {
    if (this.active) {
      const { workspace } = this.active
      this.active = null
      workspace.close()
    }
  }
}
