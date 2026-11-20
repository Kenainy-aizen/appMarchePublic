import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'

const FORMAT_VERSION = 1
const IV_LENGTH = 12
const TAG_LENGTH = 16
const HEADER_LENGTH = 1 + IV_LENGTH + TAG_LENGTH

/** Le fichier est illisible : clé incorrecte, contenu modifié ou format inconnu. */
export class FileDecryptionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FileDecryptionError'
  }
}

/**
 * Clé de chiffrement des documents joints, dérivée de la clé de données de la région (HKDF-SHA256) :
 * la même clé n'est jamais utilisée pour deux usages (base SQLite et fichiers).
 */
export function deriveFileKey(dataKey: Uint8Array): Buffer {
  return Buffer.from(hkdfSync('sha256', dataKey, Buffer.alloc(0), 'prmp-attachments-v1', 32))
}

/**
 * Chiffre un fichier : AES-256-GCM. Disposition : version (1) | IV aléatoire (12) | étiquette (16) | données.
 * `associatedData` (l'identifiant du document) est authentifié : un fichier recopié sous un autre nom est refusé.
 */
export function encryptBytes(
  key: Uint8Array,
  plaintext: Uint8Array,
  associatedData: string
): Buffer {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(associatedData, 'utf8'))
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return Buffer.concat([Buffer.from([FORMAT_VERSION]), iv, cipher.getAuthTag(), body])
}

export function decryptBytes(key: Uint8Array, blob: Uint8Array, associatedData: string): Buffer {
  const data = Buffer.from(blob.buffer, blob.byteOffset, blob.byteLength)
  if (data.length < HEADER_LENGTH || data[0] !== FORMAT_VERSION) {
    throw new FileDecryptionError('Format de fichier chiffré inconnu.')
  }
  const iv = data.subarray(1, 1 + IV_LENGTH)
  const tag = data.subarray(1 + IV_LENGTH, HEADER_LENGTH)
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAAD(Buffer.from(associatedData, 'utf8'))
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(data.subarray(HEADER_LENGTH)), decipher.final()])
  } catch {
    throw new FileDecryptionError('Fichier modifié ou clé incorrecte.')
  }
}
