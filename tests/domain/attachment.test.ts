import { describe, expect, it } from 'vitest'
import {
  ALLOWED_FILE_TYPES,
  assertContentMatchesExtension,
  ATTACHMENT_OWNER_KINDS,
  createAttachment,
  extensionOf,
  MAX_ATTACHMENT_BYTES,
  MAX_FILE_NAME_LENGTH,
  parseAttachmentOwnerKind,
  sanitizeFileName
} from '@domain/attachment'
import { DomainError } from '@domain/shared/errors'
import {
  ALLOWED_EXTENSIONS,
  ATTACHMENT_OWNER_CODES,
  MAX_ATTACHMENT_BYTES as SHARED_MAX
} from '@shared/attachment-options'

const codeOf = (action: () => unknown): string => {
  try {
    action()
  } catch (error) {
    if (error instanceof DomainError) return error.code
    throw error
  }
  return 'AUCUNE_ERREUR'
}

const input = (
  overrides: Partial<Parameters<typeof createAttachment>[0]> = {}
): Parameters<typeof createAttachment>[0] => ({
  id: 'a1',
  ownerKind: 'PROCEDURE',
  ownerId: 'p1',
  fileName: 'PV ouverture des plis.pdf',
  size: 120_000,
  addedOn: '2026-10-04',
  ...overrides
})

describe('createAttachment', () => {
  it('crée un document avec son type MIME déduit de l’extension', () => {
    expect(createAttachment(input())).toEqual({
      id: 'a1',
      ownerKind: 'PROCEDURE',
      ownerId: 'p1',
      name: 'PV ouverture des plis.pdf',
      mimeType: 'application/pdf',
      size: 120_000,
      addedOn: '2026-10-04',
      note: null
    })
  })

  it.each(Object.keys(ALLOWED_FILE_TYPES))(
    'accepte l’extension .%s, quelle que soit la casse',
    (extension) => {
      expect(
        createAttachment(input({ fileName: `Scan.${extension.toUpperCase()}` })).mimeType
      ).toBe(ALLOWED_FILE_TYPES[extension])
    }
  )

  it.each([
    'programme.exe',
    'script.js',
    'archive.zip',
    'sans-extension',
    'double.pdf.exe',
    '.pdf.'
  ])('refuse le type de « %s »', (fileName) => {
    expect(codeOf(() => createAttachment(input({ fileName })))).toBe('FILE_TYPE_NOT_ALLOWED')
  })

  it('refuse un fichier vide ou trop gros, accepte exactement la taille maximale', () => {
    expect(codeOf(() => createAttachment(input({ size: 0 })))).toBe('FILE_EMPTY')
    expect(codeOf(() => createAttachment(input({ size: MAX_ATTACHMENT_BYTES + 1 })))).toBe(
      'FILE_TOO_LARGE'
    )
    expect(createAttachment(input({ size: MAX_ATTACHMENT_BYTES })).size).toBe(MAX_ATTACHMENT_BYTES)
  })

  it('nettoie la note, la vide en null, refuse une note trop longue', () => {
    expect(createAttachment(input({ note: '  Original signé  ' })).note).toBe('Original signé')
    expect(createAttachment(input({ note: '   ' })).note).toBeNull()
    expect(codeOf(() => createAttachment(input({ note: 'x'.repeat(501) })))).toBe('NOTE_TOO_LONG')
  })

  it('refuse un nom vide et une date invalide', () => {
    expect(codeOf(() => createAttachment(input({ fileName: '   ' })))).toBe('REQUIRED_FIELD')
    expect(codeOf(() => createAttachment(input({ addedOn: '2026-02-30' })))).toBe('INVALID_DATE')
  })
})

describe('sanitizeFileName', () => {
  it.each([
    ['C:\\Users\\prmp\\Documents\\PV.pdf', 'PV.pdf'],
    ['../../etc/passwd.pdf', 'passwd.pdf'],
    ['  PV   n°1.pdf ', 'PV n°1.pdf'],
    ['a<b>c:"d"|e?f*.pdf', 'abcdef.pdf'],
    ['tab\tnom\u0000.pdf', 'tabnom.pdf']
  ])('« %s » -> « %s »', (raw, expected) => {
    expect(sanitizeFileName(raw)).toBe(expected)
  })

  it('tronque un nom trop long en gardant l’extension', () => {
    const cleaned = sanitizeFileName(`${'a'.repeat(300)}.pdf`)
    expect(cleaned).toHaveLength(MAX_FILE_NAME_LENGTH)
    expect(cleaned.endsWith('.pdf')).toBe(true)
  })

  it('extensionOf lit la dernière extension en minuscules', () => {
    expect(extensionOf('Scan.Final.PDF')).toBe('pdf')
    expect(extensionOf('sans')).toBe('')
  })
})

describe('contenu et extension', () => {
  const bytes = (...values: number[]): Uint8Array => Uint8Array.from(values)

  it.each([
    ['pdf', bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31)],
    ['jpg', bytes(0xff, 0xd8, 0xff, 0xe0)],
    ['jpeg', bytes(0xff, 0xd8, 0xff, 0xdb)],
    ['png', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)],
    ['docx', bytes(0x50, 0x4b, 0x03, 0x04)],
    ['xlsx', bytes(0x50, 0x4b, 0x03, 0x04)]
  ])('accepte une signature .%s valide', (extension, head) => {
    expect(() => {
      assertContentMatchesExtension(extension, head)
    }).not.toThrow()
  })

  it.each([
    ['un exécutable Windows renommé .pdf', 'pdf', bytes(0x4d, 0x5a, 0x90, 0x00)],
    ['un PDF renommé .png', 'png', bytes(0x25, 0x50, 0x44, 0x46, 0x2d)],
    ['un contenu vide', 'pdf', bytes()],
    ['une extension sans signature connue', 'exe', bytes(0x4d, 0x5a)]
  ])('refuse %s', (_label, extension, head) => {
    expect(
      codeOf(() => {
        assertContentMatchesExtension(extension, head)
      })
    ).toBe('FILE_CONTENT_MISMATCH')
  })
})

describe('types d’objets et règles partagées avec l’interface', () => {
  it('reconnaît les objets, refuse le reste', () => {
    expect(parseAttachmentOwnerKind('CONTRACT')).toBe('CONTRACT')
    expect(codeOf(() => parseAttachmentOwnerKind('PPM'))).toBe('INVALID_VALUE')
  })

  it('l’interface et le domaine ont les mêmes objets, extensions et taille maximale', () => {
    expect([...ATTACHMENT_OWNER_CODES]).toEqual([...ATTACHMENT_OWNER_KINDS])
    expect([...ALLOWED_EXTENSIONS].sort()).toEqual(Object.keys(ALLOWED_FILE_TYPES).sort())
    expect(SHARED_MAX).toBe(MAX_ATTACHMENT_BYTES)
  })
})
