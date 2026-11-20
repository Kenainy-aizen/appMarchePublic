import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { AttachmentFileStore } from '@application/ports'
import { DomainError } from '@domain/shared/errors'
import { writeFileAtomically } from '../atomic-write'
import { decryptBytes, encryptBytes, FileDecryptionError } from '../crypto/file-encryption'

/** Les identifiants sont des UUID générés par l'application : toute autre forme est refusée (aucun chemin possible). */
const SAFE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * Documents joints d'une région : un fichier chiffré par document, nommé par son identifiant (jamais par son
 * nom d'origine, qui reste dans la base chiffrée). Le dossier est celui de la région ; une sauvegarde doit
 * le contenir avec la base.
 */
export class EncryptedFileStore implements AttachmentFileStore {
  constructor(
    private readonly directory: string,
    private readonly key: Buffer
  ) {}

  write(attachmentId: string, bytes: Uint8Array): void {
    mkdirSync(this.directory, { recursive: true })
    writeFileAtomically(this.pathOf(attachmentId), encryptBytes(this.key, bytes, attachmentId))
  }

  read(attachmentId: string): Uint8Array {
    const path = this.pathOf(attachmentId)
    const unreadable = new DomainError(
      'ATTACHMENT_UNREADABLE',
      'Le document est introuvable, endommagé ou a été modifié : il ne peut pas être lu.'
    )
    if (!existsSync(path)) throw unreadable
    try {
      return decryptBytes(this.key, readFileSync(path), attachmentId)
    } catch (error) {
      if (error instanceof FileDecryptionError) throw unreadable
      throw error
    }
  }

  delete(attachmentId: string): void {
    rmSync(this.pathOf(attachmentId), { force: true })
  }

  private pathOf(attachmentId: string): string {
    if (!SAFE_ID.test(attachmentId)) {
      throw new DomainError('ATTACHMENT_NOT_FOUND', 'Ce document n’existe pas.')
    }
    return join(this.directory, attachmentId)
  }
}
