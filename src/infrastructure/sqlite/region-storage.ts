import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { RegionStorage, RegionWorkspace } from '@application/ports'
import { DomainError } from '@domain/shared/errors'
import { EncryptedFileStore } from '../attachments/encrypted-file-store'
import { deriveFileKey } from '../crypto/file-encryption'
import { openDatabase } from './database'
import { DatabaseAccessError, DatabaseTooNewError } from './errors'
import { migrate } from './migrator'
import { SqliteAttachmentRepository } from './repositories/attachment-repository'
import { SqliteCandidateRepository } from './repositories/candidate-repository'
import { SqliteContractRepository } from './repositories/contract-repository'
import { SqlitePpmRepository } from './repositories/ppm-repository'
import { SqliteProcedureRepository } from './repositories/procedure-repository'

const REGION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * Un fichier SQLite chiffré par région : <dossier>/<identifiant>.sqlite, et un dossier de documents joints
 * chiffrés : <dossier>/<identifiant>.files/ (à sauvegarder ensemble).
 */
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
    // Clé des documents : dérivée AVANT que l'appelant n'efface la clé de données ; effacée à la fermeture.
    const fileKey = deriveFileKey(dataKey)
    return {
      regionId,
      repositories: {
        ppms: new SqlitePpmRepository(db),
        procedures: new SqliteProcedureRepository(db),
        candidates: new SqliteCandidateRepository(db),
        contracts: new SqliteContractRepository(db),
        attachments: new SqliteAttachmentRepository(db)
      },
      files: new EncryptedFileStore(this.filesFor(regionId), fileKey),
      close: () => {
        fileKey.fill(0)
        db.close()
      }
    }
  }

  remove(regionId: string): void {
    const file = this.fileFor(regionId)
    for (const path of [file, `${file}-journal`, `${file}-wal`, `${file}-shm`]) {
      rmSync(path, { force: true })
    }
    rmSync(this.filesFor(regionId), { recursive: true, force: true })
  }

  private filesFor(regionId: string): string {
    return join(this.directory, `${this.safeId(regionId)}.files`)
  }

  private fileFor(regionId: string): string {
    return join(this.directory, `${this.safeId(regionId)}.sqlite`)
  }

  /** L'identifiant sert de nom de fichier : on refuse tout ce qui n'est pas un UUID (anti « ../ »). */
  private safeId(regionId: string): string {
    if (!REGION_ID_PATTERN.test(regionId)) throw new Error('Identifiant de région invalide.')
    return regionId
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
