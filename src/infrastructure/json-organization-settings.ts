import { existsSync, readFileSync } from 'node:fs'
import { z } from 'zod'
import type { OrganizationSettings } from '@application/ports'
import {
  ALERT_HORIZON_CHOICES,
  type AlertHorizonDays,
  DEFAULT_ALERT_HORIZON_DAYS,
  parseAlertHorizon
} from '@domain/alerts'
import { writeFileAtomically } from './atomic-write'

const settingsSchema = z.object({
  version: z.literal(1),
  organizationName: z.string().nullable(),
  // Absent des fichiers écrits avant la Phase 9 : valeur par défaut.
  alertHorizonDays: z.number().optional()
})

interface StoredSettings {
  readonly organizationName: string | null
  readonly alertHorizonDays: AlertHorizonDays
}

const DEFAULTS: StoredSettings = {
  organizationName: null,
  alertHorizonDays: DEFAULT_ALERT_HORIZON_DAYS
}

/**
 * Réglages généraux de l'application (hors région) : nom de la PRMP et délai d'alerte des échéances.
 * Ce fichier ne contient aucun secret. S'il est illisible, il est ignoré (valeurs par défaut) : un simple
 * réglage ne doit jamais empêcher d'ouvrir les données. Une valeur de délai inconnue revient à la valeur par défaut.
 */
export class JsonOrganizationSettings implements OrganizationSettings {
  constructor(private readonly filePath: string) {}

  getName(): string | null {
    return this.load().organizationName
  }

  saveName(name: string): void {
    this.save({ ...this.load(), organizationName: name })
  }

  getAlertHorizonDays(): number {
    return this.load().alertHorizonDays
  }

  saveAlertHorizonDays(days: number): void {
    this.save({ ...this.load(), alertHorizonDays: parseAlertHorizon(days) })
  }

  private load(): StoredSettings {
    if (!existsSync(this.filePath)) return DEFAULTS
    try {
      const parsed = settingsSchema.parse(JSON.parse(readFileSync(this.filePath, 'utf8')))
      const horizon = ALERT_HORIZON_CHOICES.find((choice) => choice === parsed.alertHorizonDays)
      return {
        organizationName: parsed.organizationName,
        alertHorizonDays: horizon ?? DEFAULT_ALERT_HORIZON_DAYS
      }
    } catch {
      return DEFAULTS
    }
  }

  private save(settings: StoredSettings): void {
    writeFileAtomically(this.filePath, JSON.stringify({ version: 1, ...settings }, null, 2))
  }
}
