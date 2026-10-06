import { describe, expect, it } from 'vitest'
import { decodeBase32, encodeBase32 } from '@infrastructure/crypto/base32'

describe('base32', () => {
  it('suit les vecteurs de test de la RFC 4648 (sans remplissage)', () => {
    const vectors: Record<string, string> = {
      f: 'MY',
      fo: 'MZXQ',
      foo: 'MZXW6',
      foob: 'MZXW6YQ',
      fooba: 'MZXW6YTB',
      foobar: 'MZXW6YTBOI'
    }
    for (const [text, encoded] of Object.entries(vectors)) {
      expect(encodeBase32(Buffer.from(text))).toBe(encoded)
      expect(decodeBase32(encoded)?.toString()).toBe(text)
    }
  })

  it('fait un aller-retour sur 20 octets aléatoires et produit 32 caractères', () => {
    const bytes = Buffer.from(Array.from({ length: 20 }, (_, index) => (index * 37 + 11) % 256))
    const encoded = encodeBase32(bytes)
    expect(encoded).toHaveLength(32)
    expect(decodeBase32(encoded)?.equals(bytes)).toBe(true)
  })

  it('refuse un caractère hors alphabet', () => {
    expect(decodeBase32('ABC1')).toBeNull()
    expect(decodeBase32('abc')).toBeNull()
  })
})
