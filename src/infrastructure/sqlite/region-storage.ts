import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { RegionStorage, RegionWorkspace } from '@application/ports'
import { DomainError } from '@domain/shared/errors'
import { openDatabase } from './database'
import { DatabaseAccessError, DatabaseTooNewError } from './errors'
import { migrate } from './migrator'
import { SqliteCandidateRepository } from './repositories/candidate-repository'
import { SqliteContractRepository } from './repositories/contract-repository'
import { SqlitePpmRepository } from './repositories/ppm-repository'
import { SqliteProcedureRepository } from './repositories/procedure-repository'

const REGION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Un fichier SQLite chiffré par région : <dossier>/<identifiant>.sqlite */
export class SqliteRegionStorage implements RegionStorage {
  constructor(private readonly directory: string) {}

  create(regionId: string, dataKey: Buffer): void {
    const file = this.fileFor(regionId)
    if (existsSync(file)) throw new Error('Un fichier de données existe déjà pour cette région.')
    mkdirSync(this.directory, { recursive: true })
    const db = openDatabase(file, { key: dataKey })
    try {
      migrate(db)
    } finally {
      db.close()
    }
  }

  open(regionId: string, dataKey: Buffer): RegionWorkspace {
    const file = this.fileFor(regionId)
    if (!existsSync(file)) {
      throw new DomainError(
        'REGION_DATA_MISSING',
        'Le fichier de données de cette région est introuvable. Restaurez une sauvegarde.'
      )
    }
    const db = openWithFriendlyErrors(file, dataKey)
    try {
      migrate(db) // applique les migrations apportées par une nouvelle version de l'application
    } catch (error) {
      db.close()
      throw toDomainError(error)
    }
    return {
      regionId,
      repositories: {
        ppms: new SqlitePpmRepository(db),
        procedures: new SqliteProcedureRepository(db),
        candidates: new SqliteCandidateRepository(db),
        contracts: new SqliteContractRepository(db)
      },
      close: () => {
        db.close()
      }
    }
  }

  remove(regionId: string): void {
    const file = this.fileFor(regionId)
    for (const path of [file, `${file}-journal`, `${file}-wal`, `${file}-shm`]) {
      rmSync(path, { force: true })
    }
  }

  private fileFor(regionId: string): string {
    // L'identifiant sert de nom de fichier : on refuse tout ce qui n'est pas un UUID (anti « ../ »).
    if (!REGION_ID_PATTERN.test(regionId)) throw new Error('Identifiant de région invalide.')
    return join(this.directory, `${regionId}.sqlite`)
  }
}

function openWithFriendlyErrors(file: string, dataKey: Buffer): ReturnType<typeof openDatabase> {
  try {
    return openDatabase(file, { key: dataKey })
  } catch (error) {
    throw toDomainError(error)
  }
}

/** Traduit les erreurs techniques de la base en messages que la PRMP peut comprendre et agir dessus. */
function toDomainError(error: unknown): unknown {
  if (error instanceof DatabaseAccessError) {
    return new DomainError(
      'REGION_DATA_UNREADABLE',
      'Les données de cette région sont illisibles (fichier endommagé ou ne correspondant pas à cette région). Restaurez une sauvegarde.'
    )
  }
  if (error instanceof DatabaseTooNewError) {
    return new DomainError(
      'APPLICATION_TOO_OLD',
      'Les données de cette région ont été enregistrées par une version plus récente de l’application. Mettez l’application à jour.'
    )
  }
  return error
}
