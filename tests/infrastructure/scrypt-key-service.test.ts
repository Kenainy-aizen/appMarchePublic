import { describe, expect, it } from 'vitest'
import { DomainError } from '@domain/shared/errors'
import {
  formatRecoveryKey,
  parseRecoveryKey,
  ScryptRegionKeyService
} from '@infrastructure/crypto/scrypt-key-service'

// Paramètres faibles : uniquement pour que les tests restent rapides (la production utilise N = 2^17).
const service = new ScryptRegionKeyService({ n: 1024, r: 8, p: 1 })
const REGION_A = '11111111-1111-4111-8111-111111111111'
const REGION_B = '22222222-2222-4222-8222-222222222222'
const PASSWORD = 'phrase de passe très longue'

describe('ScryptRegionKeyService', () => {
  it('retrouve la même clé de données avec le bon mot de passe', async () => {
    const { secrets, dataKey } = await service.createSecrets(REGION_A, PASSWORD)

    const unlocked = await service.unlockWithPassword(REGION_A, secrets, PASSWORD)

    expect(dataKey).toHaveLength(32)
    expect(unlocked.equals(dataKey)).toBe(true)
  })

  it('refuse un mauvais mot de passe', async () => {
    const { secrets } = await service.createSecrets(REGION_A, PASSWORD)

    await expect(
      service.unlockWithPassword(REGION_A, secrets, 'autre phrase de passe')
    ).rejects.toMatchObject({
      code: 'INVALID_PASSWORD'
    })
  })

  it('retrouve la même clé de données avec la clé de récupération, sous différentes écritures', async () => {
    const { secrets, dataKey, recoveryKey } = await service.createSecrets(REGION_A, PASSWORD)

    expect(recoveryKey).toMatch(/^([A-Z2-7]{4}-){7}[A-Z2-7]{4}$/)
    for (const typed of [
      recoveryKey,
      recoveryKey.toLowerCase(),
      recoveryKey.replaceAll('-', ' ')
    ]) {
      expect(service.unlockWithRecoveryKey(REGION_A, secrets, typed).equals(dataKey)).toBe(true)
    }
  })

  it('refuse une clé de récupération fausse, mal formée ou venant d’une autre région', async () => {
    const a = await service.createSecrets(REGION_A, PASSWORD)
    const b = await service.createSecrets(REGION_B, PASSWORD)

    for (const bad of [b.recoveryKey, 'ABCD-EFGH', '', 'ÉÉÉÉ-ÉÉÉÉ-ÉÉÉÉ-ÉÉÉÉ-ÉÉÉÉ-ÉÉÉÉ-ÉÉÉÉ-ÉÉÉÉ']) {
      expect(() => service.unlockWithRecoveryKey(REGION_A, a.secrets, bad)).toThrow(DomainError)
    }
  })

  it('génère des secrets différents à chaque région, même avec le même mot de passe', async () => {
    const a = await service.createSecrets(REGION_A, PASSWORD)
    const b = await service.createSecrets(REGION_B, PASSWORD)

    expect(a.dataKey.equals(b.dataKey)).toBe(false)
    expect(a.secrets.kdf.salt).not.toBe(b.secrets.kdf.salt)
    expect(a.recoveryKey).not.toBe(b.recoveryKey)
  })

  it('lie chaque enveloppe à sa région : copier les secrets d’une région vers une autre ne les ouvre pas', async () => {
    const a = await service.createSecrets(REGION_A, PASSWORD)

    await expect(service.unlockWithPassword(REGION_B, a.secrets, PASSWORD)).rejects.toMatchObject({
      code: 'INVALID_PASSWORD'
    })
    expect(() => service.unlockWithRecoveryKey(REGION_B, a.secrets, a.recoveryKey)).toThrow(
      DomainError
    )
  })

  it('détecte une enveloppe modifiée', async () => {
    const { secrets } = await service.createSecrets(REGION_A, PASSWORD)
    const tampered = {
      ...secrets,
      passwordWrappedKey: {
        ...secrets.passwordWrappedKey,
        data: Buffer.alloc(32, 1).toString('base64')
      }
    }

    await expect(service.unlockWithPassword(REGION_A, tampered, PASSWORD)).rejects.toMatchObject({
      code: 'INVALID_PASSWORD'
    })
  })

  it('traite pareil un même mot de passe saisi avec « é » composé ou décomposé', async () => {
    const { secrets } = await service.createSecrets(REGION_A, 'mot de passe défini')

    const decomposed = 'mot de passe de\u0301fini'
    await expect(service.unlockWithPassword(REGION_A, secrets, decomposed)).resolves.toBeDefined()
  })

  it('ne stocke jamais la clé de données, le mot de passe ni la clé de récupération en clair', async () => {
    const { secrets, dataKey, recoveryKey } = await service.createSecrets(REGION_A, PASSWORD)
    const stored = JSON.stringify(secrets)

    for (const secret of [
      PASSWORD,
      recoveryKey,
      recoveryKey.replaceAll('-', ''),
      dataKey.toString('base64'),
      dataKey.toString('hex')
    ]) {
      expect(stored.includes(secret)).toBe(false)
    }
  })
})

describe('clé de récupération', () => {
  it('se formate en groupes de 4 et se relit', () => {
    const bytes = Buffer.from(Array.from({ length: 20 }, (_, index) => index * 11))
    const formatted = formatRecoveryKey(bytes)

    expect(formatted.split('-')).toHaveLength(8)
    expect(parseRecoveryKey(formatted)?.equals(bytes)).toBe(true)
  })
})
