const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** Encode en base32 (RFC 4648), sans remplissage. */
export function encodeBase32(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += ALPHABET.charAt((value >>> (bits - 5)) & 31)
      bits -= 5
    }
  }
  if (bits > 0) output += ALPHABET.charAt((value << (5 - bits)) & 31)
  return output
}

/** Décode du base32 (sans remplissage). Retourne `null` si un caractère est invalide. */
export function decodeBase32(text: string): Buffer | null {
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const char of text) {
    const index = ALPHABET.indexOf(char)
    if (index < 0) return null
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}
