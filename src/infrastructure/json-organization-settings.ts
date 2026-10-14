import { existsSync, readFileSync } from 'node:fs'
import { z } from 'zod'
import type { OrganizationSettings } from '@application/ports'
import { writeFileAtomically } from './atomic-write'

const settingsSchema = z.object({
  version: z.literal(1),
  organizationName: z.string().nullable()
})

/**
 * Réglages généraux de l'application (hors région) : pour l'instant, le nom de la PRMP.
 * Ce fichier ne contient aucun secret. S'il est illisible, il est ignoré (le nom est simplement
 * redemandé) : un simple libellé ne doit jamais empêcher d'ouvrir les données.
 */
export class JsonOrganizationSettings implements OrganizationSettings {
  constructor(private readonly filePath: string) {}

  getName(): string | null {
    if (!existsSync(this.filePath)) return null
    try {
      return settingsSchema.parse(JSON.parse(readFileSync(this.filePath, 'utf8'))).organizationName
    } catch {
      return null
    }
  }

  saveName(name: string): void {
    writeFileAtomically(
      this.filePath,
      JSON.stringify({ version: 1, organizationName: name }, null, 2)
    )
  }
}
