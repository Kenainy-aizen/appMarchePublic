import { existsSync, readFileSync } from 'node:fs'
import { z } from 'zod'
import type { RegionRegistry, RegisteredRegion } from '@application/ports'
import { writeFileAtomically } from './atomic-write'

const wrappedKeySchema = z.object({ iv: z.string(), data: z.string(), tag: z.string() })

const secretsSchema = z.object({
  version: z.literal(1),
  kdf: z.object({
    algorithm: z.literal('scrypt'),
    n: z.number().int().positive(),
    r: z.number().int().positive(),
    p: z.number().int().positive(),
    salt: z.string()
  }),
  passwordWrappedKey: wrappedKeySchema,
  recoverySalt: z.string(),
  recoveryWrappedKey: wrappedKeySchema
})

const registrySchema = z.object({
  version: z.literal(1),
  regions: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      createdOn: z.string(),
      secrets: secretsSchema
    })
  )
})

/** Le registre est illisible : fichier modifié à la main ou corrompu. */
export class RegistryCorruptedError extends Error {
  constructor(options?: ErrorOptions) {
    super('Le fichier des régions est illisible. Restaurez la dernière sauvegarde.', options)
    this.name = 'RegistryCorruptedError'
  }
}

/**
 * Registre des régions dans un fichier JSON. Il ne contient AUCUN secret exploitable seul :
 * uniquement des clés enveloppées (chiffrées) et les paramètres de dérivation.
 */
export class JsonRegionRegistry implements RegionRegistry {
  constructor(private readonly filePath: string) {}

  list(): readonly RegisteredRegion[] {
    return this.read()
  }

  find(regionId: string): RegisteredRegion | null {
    return this.read().find((region) => region.id === regionId) ?? null
  }

  add(region: RegisteredRegion): void {
    const regions = this.read()
    if (regions.some((existing) => existing.id === region.id)) {
      throw new Error(`La région ${region.id} existe déjà dans le registre.`)
    }
    this.write([...regions, region])
  }

  private read(): RegisteredRegion[] {
    if (!existsSync(this.filePath)) return []
    try {
      const parsed = registrySchema.parse(JSON.parse(readFileSync(this.filePath, 'utf8')))
      return parsed.regions
    } catch (cause) {
      throw new RegistryCorruptedError({ cause })
    }
  }

  /** Écriture atomique : fichier temporaire puis renommage, pour ne jamais laisser un registre à moitié écrit. */
  private write(regions: readonly RegisteredRegion[]): void {
    writeFileAtomically(this.filePath, JSON.stringify({ version: 1, regions }, null, 2))
  }
}
