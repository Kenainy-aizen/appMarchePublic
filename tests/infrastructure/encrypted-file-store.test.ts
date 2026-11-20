import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DomainError } from '@domain/shared/errors'
import { EncryptedFileStore } from '@infrastructure/attachments/encrypted-file-store'
import { deriveFileKey } from '@infrastructure/crypto/file-encryption'
import { createTempDirectory } from './helpers'

const temp = { current: createTempDirectory() }
beforeEach(() => {
  temp.current = createTempDirectory()
})
afterEach(() => {
  temp.current.cleanup()
})

const store = (seed = 1): EncryptedFileStore =>
  new EncryptedFileStore(join(temp.current.path, 'docs'), deriveFileKey(Buffer.alloc(32, seed)))

const codeOf = (action: () => unknown): string => {
  try {
    action()
  } catch (error) {
    if (error instanceof DomainError) return error.code
    throw error
  }
  return 'AUCUNE_ERREUR'
}

describe('EncryptedFileStore', () => {
  it('écrit et relit un document, dossier créé au besoin', () => {
    const id = randomUUID()
    store().write(id, Buffer.from('%PDF-1.7 contenu du PV'))

    expect(Buffer.from(store().read(id)).toString()).toBe('%PDF-1.7 contenu du PV')
  })

  it('n’écrit que des fichiers nommés par leur identifiant, chiffrés, sans fichier temporaire', () => {
    const id = randomUUID()
    store().write(id, Buffer.from('CONFIDENTIEL 12 345 678'))

    const files = readdirSync(join(temp.current.path, 'docs'))
    expect(files).toEqual([id])
    expect(readFileSync(join(temp.current.path, 'docs', id)).includes('CONFIDENTIEL')).toBe(false)
  })

  it('refuse de relire avec une autre clé (une autre région)', () => {
    const id = randomUUID()
    store(1).write(id, Buffer.from('contenu'))
    expect(codeOf(() => store(2).read(id))).toBe('ATTACHMENT_UNREADABLE')
  })

  it('signale un fichier modifié, recopié sous un autre nom, ou absent', () => {
    const id = randomUUID()
    const other = randomUUID()
    store().write(id, Buffer.from('contenu'))
    const path = join(temp.current.path, 'docs', id)

    writeFileSync(join(temp.current.path, 'docs', other), readFileSync(path))
    expect(codeOf(() => store().read(other))).toBe('ATTACHMENT_UNREADABLE')

    const tampered = readFileSync(path)
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 1
    writeFileSync(path, tampered)
    expect(codeOf(() => store().read(id))).toBe('ATTACHMENT_UNREADABLE')

    expect(codeOf(() => store().read(randomUUID()))).toBe('ATTACHMENT_UNREADABLE')
  })

  it('supprime un document, sans erreur s’il n’existe pas', () => {
    const id = randomUUID()
    store().write(id, Buffer.from('contenu'))

    store().delete(id)
    store().delete(id)

    expect(existsSync(join(temp.current.path, 'docs', id))).toBe(false)
  })

  it.each(['../evasion', '..\\evasion', 'sous/dossier', '', 'pas-un-uuid', `${randomUUID()}/../x`])(
    'refuse l’identifiant « %s » (aucun chemin possible)',
    (id) => {
      expect(
        codeOf(() => {
          store().write(id, Buffer.from('x'))
        })
      ).toBe('ATTACHMENT_NOT_FOUND')
      expect(codeOf(() => store().read(id))).toBe('ATTACHMENT_NOT_FOUND')
      expect(
        codeOf(() => {
          store().delete(id)
        })
      ).toBe('ATTACHMENT_NOT_FOUND')
    }
  )
})
