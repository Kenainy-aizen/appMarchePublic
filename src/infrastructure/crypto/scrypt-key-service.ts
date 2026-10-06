import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, scrypt } from 'node:crypto'
import type { RegionKeyService, RegionSecrets, WrappedKey } from '@application/ports'
import { DomainError } from '@domain/shared/errors'
import { decodeBase32, encodeBase32 } from './base32'

export interface ScryptParams {
  readonly n: number
  readonly r: number
  readonly p: number
}

/** Recommandation OWASP pour scrypt : N = 2^17, r = 8, p = 1 (≈ 128 Mo de mémoire, ≈ 0,3 s). */
export const DEFAULT_SCRYPT_PARAMS: ScryptParams = { n: 131_072, r: 8, p: 1 }

const KEY_BYTES = 32
const RECOVERY_BYTES = 20 // 160 bits -> 32 caractères base32, sans remplissage
const RECOVERY_INFO = 'prmp-suivi-marches/recovery-kek/v1'

type Purpose = 'password' | 'recovery'

/**
 * Chiffrement « par enveloppe » :
 *  - une clé aléatoire de 32 octets (DEK) chiffre la base SQLite ;
 *  - la DEK est stockée deux fois, enveloppée (AES-256-GCM) par une clé dérivée du mot de passe (scrypt)
 *    et par une clé dérivée de la clé de récupération (HKDF).
 * Changer le mot de passe ne demande donc jamais de rechiffrer la base.
 */
export class ScryptRegionKeyService implements RegionKeyService {
  constructor(private readonly params: ScryptParams = DEFAULT_SCRYPT_PARAMS) {}

  async createSecrets(
    regionId: string,
    password: string
  ): Promise<{ secrets: RegionSecrets; dataKey: Buffer; recoveryKey: string }> {
    const dataKey = randomBytes(KEY_BYTES)
    const salt = randomBytes(16)
    const recoverySalt = randomBytes(16)
    const recoveryBytes = randomBytes(RECOVERY_BYTES)

    const passwordKek = await deriveFromPassword(password, salt, this.params)
    const recoveryKek = deriveFromRecovery(recoveryBytes, recoverySalt)
    try {
      const secrets: RegionSecrets = {
        version: 1,
        kdf: { algorithm: 'scrypt', ...this.params, salt: salt.toString('base64') },
        passwordWrappedKey: wrap(dataKey, passwordKek, aad(regionId, 'password')),
        recoverySalt: recoverySalt.toString('base64'),
        recoveryWrappedKey: wrap(dataKey, recoveryKek, aad(regionId, 'recovery'))
      }
      return { secrets, dataKey, recoveryKey: formatRecoveryKey(recoveryBytes) }
    } finally {
      passwordKek.fill(0)
      recoveryKek.fill(0)
      recoveryBytes.fill(0)
    }
  }

  async unlockWithPassword(
    regionId: string,
    secrets: RegionSecrets,
    password: string
  ): Promise<Buffer> {
    const kek = await deriveFromPassword(
      password,
      Buffer.from(secrets.kdf.salt, 'base64'),
      secrets.kdf
    )
    try {
      const dataKey = unwrap(secrets.passwordWrappedKey, kek, aad(regionId, 'password'))
      if (!dataKey) throw new DomainError('INVALID_PASSWORD', 'Mot de passe incorrect.')
      return dataKey
    } finally {
      kek.fill(0)
    }
  }

  unlockWithRecoveryKey(regionId: string, secrets: RegionSecrets, recoveryKey: string): Buffer {
    const recoveryBytes = parseRecoveryKey(recoveryKey)
    const invalid = (): DomainError =>
      new DomainError('INVALID_RECOVERY_KEY', 'Clé de récupération incorrecte.')
    if (!recoveryBytes) throw invalid()

    const kek = deriveFromRecovery(recoveryBytes, Buffer.from(secrets.recoverySalt, 'base64'))
    try {
      const dataKey = unwrap(secrets.recoveryWrappedKey, kek, aad(regionId, 'recovery'))
      if (!dataKey) throw invalid()
      return dataKey
    } finally {
      kek.fill(0)
      recoveryBytes.fill(0)
    }
  }
}

// ----------------------------------------------------------------------------------------------

/** Les données authentifiées lient chaque enveloppe à sa région et à son usage : on ne peut pas les échanger. */
function aad(regionId: string, purpose: Purpose): Buffer {
  return Buffer.from(`prmp:${regionId}:${purpose}`, 'utf8')
}

function deriveFromPassword(password: string, salt: Buffer, params: ScryptParams): Promise<Buffer> {
  // NFKC : un même mot de passe saisi avec des claviers différents (é composé ou décomposé) donne la même clé.
  const normalized = Buffer.from(password.normalize('NFKC'), 'utf8')
  return new Promise((resolve, reject) => {
    scrypt(
      normalized,
      salt,
      KEY_BYTES,
      { N: params.n, r: params.r, p: params.p, maxmem: 256 * params.n * params.r },
      (error, derivedKey) => {
        normalized.fill(0)
        if (error) reject(error)
        else resolve(derivedKey)
      }
    )
  })
}

/** La clé de récupération est déjà aléatoire (160 bits) : HKDF suffit, inutile de ralentir. */
function deriveFromRecovery(recoveryBytes: Buffer, salt: Buffer): Buffer {
  return Buffer.from(hkdfSync('sha256', recoveryBytes, salt, RECOVERY_INFO, KEY_BYTES))
}

function wrap(key: Buffer, kek: Buffer, associatedData: Buffer): WrappedKey {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', kek, iv)
  cipher.setAAD(associatedData)
  const data = Buffer.concat([cipher.update(key), cipher.final()])
  return {
    iv: iv.toString('base64'),
    data: data.toString('base64'),
    tag: cipher.getAuthTag().toString('base64')
  }
}

/** Retourne `null` si l'authentification échoue (mauvaise clé ou données modifiées). */
function unwrap(wrapped: WrappedKey, kek: Buffer, associatedData: Buffer): Buffer | null {
  try {
    const decipher = createDecipheriv('aes-256-gcm', kek, Buffer.from(wrapped.iv, 'base64'))
    decipher.setAAD(associatedData)
    decipher.setAuthTag(Buffer.from(wrapped.tag, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(wrapped.data, 'base64')), decipher.final()])
  } catch {
    return null
  }
}

/** Format affiché : 8 groupes de 4 caractères, ex. ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567. */
export function formatRecoveryKey(bytes: Uint8Array): string {
  return (encodeBase32(bytes).match(/.{1,4}/g) ?? []).join('-')
}

/** Accepte minuscules, espaces et tirets. Retourne `null` si la forme est invalide. */
export function parseRecoveryKey(text: string): Buffer | null {
  const compact = text.toUpperCase().replace(/[\s-]/g, '')
  if (compact.length !== 32) return null
  const bytes = decodeBase32(compact)
  return bytes && bytes.length === RECOVERY_BYTES ? bytes : null
}
