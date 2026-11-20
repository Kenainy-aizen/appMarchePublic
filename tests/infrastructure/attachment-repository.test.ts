import { beforeEach, describe, expect, it } from 'vitest'
import { createAttachment } from '@domain/attachment'
import type { SqliteDatabase } from '@infrastructure/sqlite/database'
import { SqliteAttachmentRepository } from '@infrastructure/sqlite/repositories/attachment-repository'
import { createMigratedDatabase } from './helpers'

let db: SqliteDatabase
let repository: SqliteAttachmentRepository

beforeEach(() => {
  db = createMigratedDatabase()
  repository = new SqliteAttachmentRepository(db)
})

const attachment = (
  id: string,
  overrides: Partial<Parameters<typeof createAttachment>[0]> = {}
): ReturnType<typeof createAttachment> =>
  createAttachment({
    id,
    ownerKind: 'PROCEDURE',
    ownerId: 'p1',
    fileName: `${id}.pdf`,
    size: 1000,
    addedOn: '2026-10-04',
    ...overrides
  })

describe('SqliteAttachmentRepository', () => {
  it('retrouve un document à l’identique, note comprise', () => {
    const saved = attachment('a1', { note: 'Original signé', fileName: 'PV n°1.pdf' })
    repository.save(saved)
    expect(repository.findById('a1')).toEqual(saved)
    expect(repository.findById('absent')).toBeNull()
  })

  it('met à jour un document existant', () => {
    repository.save(attachment('a1'))
    repository.save(attachment('a1', { note: 'Corrigée' }))
    expect(repository.listByOwner('PROCEDURE', 'p1')).toHaveLength(1)
    expect(repository.findById('a1')?.note).toBe('Corrigée')
  })

  it('liste les documents d’un objet, du plus récent au plus ancien, sans mélanger les objets', () => {
    repository.save(attachment('ancien', { addedOn: '2026-01-01' }))
    repository.save(attachment('recent', { addedOn: '2026-06-01' }))
    repository.save(attachment('meme-jour-1', { addedOn: '2026-03-01' }))
    repository.save(attachment('meme-jour-2', { addedOn: '2026-03-01' }))
    repository.save(attachment('autre-objet', { ownerId: 'p2' }))
    repository.save(attachment('autre-type', { ownerKind: 'CONTRACT' }))

    expect(repository.listByOwner('PROCEDURE', 'p1').map((a) => a.id)).toEqual([
      'recent',
      'meme-jour-2',
      'meme-jour-1',
      'ancien'
    ])
    expect(repository.listByOwner('CONTRACT', 'p1').map((a) => a.id)).toEqual(['autre-type'])
  })

  it('supprime un document, ou tous ceux d’un objet en renvoyant leurs identifiants', () => {
    repository.save(attachment('a1'))
    repository.save(attachment('a2'))
    repository.save(attachment('b1', { ownerId: 'p2' }))

    repository.delete('a1')
    expect(repository.findById('a1')).toBeNull()

    expect(repository.deleteByOwner('PROCEDURE', 'p1')).toEqual(['a2'])
    expect(repository.listByOwner('PROCEDURE', 'p1')).toEqual([])
    expect(repository.listByOwner('PROCEDURE', 'p2')).toHaveLength(1)
    expect(repository.deleteByOwner('PROCEDURE', 'p1')).toEqual([])
  })

  it('la base refuse un type d’objet ou une taille hors règles (filet de sécurité)', () => {
    const insert = (kind: string, size: number): void => {
      db.prepare(
        "INSERT INTO attachment (id, owner_kind, owner_id, name, mime_type, size, added_on) VALUES (lower(hex(randomblob(4))), ?, 'x', 'a.pdf', 'application/pdf', ?, '2026-01-01')"
      ).run(kind, size)
    }
    expect(() => {
      insert('PPM', 10)
    }).toThrow()
    expect(() => {
      insert('CONTRACT', 0)
    }).toThrow()
    expect(() => {
      insert('CONTRACT', 10)
    }).not.toThrow()
  })
})
