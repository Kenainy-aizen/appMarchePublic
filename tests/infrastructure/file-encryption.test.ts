import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  decryptBytes,
  deriveFileKey,
  encryptBytes,
  FileDecryptionError
} from '@infrastructure/crypto/file-encryption'

const key = (): Buffer => deriveFileKey(Buffer.alloc(32, 7))
const text = (value: string): Buffer => Buffer.from(value, 'utf8')

describe('chiffrement des fichiers', () => {
  it('chiffre puis déchiffre à l’identique, y compris un contenu vide ou binaire', () => {
    for (const content of [
      text('Procès-verbal d’ouverture des plis'),
      Buffer.alloc(0),
      randomBytes(100_000)
    ]) {
      expect(
        decryptBytes(key(), encryptBytes(key(), content, 'doc-1'), 'doc-1').equals(content)
      ).toBe(true)
    }
  })

  it('ne laisse rien de lisible dans le contenu chiffré', () => {
    const blob = encryptBytes(key(), text('CONFIDENTIEL : montant 12 345 678 Ar'), 'doc-1')
    expect(blob.includes('CONFIDENTIEL')).toBe(false)
    expect(blob.includes('12 345')).toBe(false)
  })

  it('produit un résultat différent à chaque chiffrement (IV aléatoire)', () => {
    const a = encryptBytes(key(), text('même contenu'), 'doc-1')
    const b = encryptBytes(key(), text('même contenu'), 'doc-1')
    expect(a.equals(b)).toBe(false)
  })

  it('refuse une clé incorrecte', () => {
    const blob = encryptBytes(key(), text('secret'), 'doc-1')
    expect(() => decryptBytes(deriveFileKey(Buffer.alloc(32, 8)), blob, 'doc-1')).toThrow(
      FileDecryptionError
    )
  })

  it('refuse un fichier modifié (n’importe quel octet : en-tête, étiquette ou données)', () => {
    const blob = encryptBytes(key(), text('contenu à protéger'), 'doc-1')
    for (const position of [0, 1, 13, 20, blob.length - 1]) {
      const tampered = Buffer.from(blob)
      tampered[position] = (tampered[position] ?? 0) ^ 0xff
      expect(() => decryptBytes(key(), tampered, 'doc-1'), `octet ${String(position)}`).toThrow(
        FileDecryptionError
      )
    }
  })

  it('refuse un fichier tronqué ou d’un format inconnu', () => {
    const blob = encryptBytes(key(), text('contenu'), 'doc-1')
    expect(() => decryptBytes(key(), blob.subarray(0, 10), 'doc-1')).toThrow(FileDecryptionError)
    expect(() => decryptBytes(key(), Buffer.alloc(0), 'doc-1')).toThrow(FileDecryptionError)
    const otherVersion = Buffer.from(blob)
    otherVersion[0] = 99
    expect(() => decryptBytes(key(), otherVersion, 'doc-1')).toThrow(FileDecryptionError)
  })

  it('lie le fichier à son identifiant : recopié sous un autre nom, il est refusé', () => {
    const blob = encryptBytes(key(), text('contenu'), 'doc-1')
    expect(() => decryptBytes(key(), blob, 'doc-2')).toThrow(FileDecryptionError)
  })
})

describe('deriveFileKey', () => {
  it('est déterministe, longue de 32 octets, et différente de la clé de données', () => {
    const dataKey = randomBytes(32)
    const derived = deriveFileKey(dataKey)
    expect(derived).toHaveLength(32)
    expect(deriveFileKey(dataKey).equals(derived)).toBe(true)
    expect(derived.equals(dataKey)).toBe(false)
    expect(deriveFileKey(randomBytes(32)).equals(derived)).toBe(false)
  })
})
