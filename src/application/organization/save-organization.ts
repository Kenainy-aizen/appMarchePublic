import { parseOrganizationName } from '@domain/organization'
import type { OrganizationSettings } from '../ports'

/** Enregistre (ou corrige) le nom de la PRMP. Ne nécessite aucune région ouverte. */
export class SaveOrganizationUseCase {
  constructor(private readonly settings: OrganizationSettings) {}

  execute(input: { readonly name: string }): { readonly name: string } {
    const name = parseOrganizationName(input.name)
    this.settings.saveName(name)
    return { name }
  }
}
