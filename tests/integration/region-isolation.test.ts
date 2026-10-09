import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LoginThrottle } from '@application/login-throttle'
import { RegionSession } from '@application/region-session'
import { CreateRegionUseCase, type CreateRegionResult } from '@application/regions/create-region'
import { OpenRegionUseCase } from '@application/regions/open-region'
import { createPpm, createPpmLine, addPpmLine } from '@domain/ppm'
import { ScryptRegionKeyService } from '@infrastructure/crypto/scrypt-key-service'
import { JsonRegionRegistry } from '@infrastructure/json-region-registry'
import { openDatabase } from '@infrastructure/sqlite/database'
import { DatabaseAccessError } from '@infrastructure/sqlite/errors'
import { SqliteRegionStorage } from '@infrastructure/sqlite/region-storage'
import { SystemClock, UuidGenerator } from '@infrastructure/system-ports'
import { createTempDirectory } from './helpers'

/**
 * Tests d'intégration avec les VRAIS composants (chiffrement, registre, bases SQLite), sans simulation.
 * Chaque appel à `boot()` simule un démarrage de l'application sur le même dossier de données.
 */
const PASSWORD_A = 'phrase de passe de la région A'
const PASSWORD_B = 'phrase de passe de la région B'
const SECRET_OBJECT = 'OBJET-CONFIDENTIEL-REGION-A'

const temp = { current: createTempDirectory() }
beforeEach(() => {
  temp.current = createTempDirectory()
})
afterEach(() => {
  temp.current.cleanup()
})

interface App {
  readonly registry: JsonRegionRegistry
  readonly keys: ScryptRegionKeyService
  readonly storage: SqliteRegionStorage
  readonly session: RegionSession
  readonly create: CreateRegionUseCase
  readonly open: OpenRegionUseCase
}

interface TwoRegions {
  readonly a: CreateRegionResult
  readonly b: CreateRegionResult
}

function boot(): App {
  const registry = new JsonRegionRegistry(join(temp.current.path, 'regions.json'))
  const keys = new ScryptRegionKeyService({ n: 1024, r: 8, p: 1 }) // rapide pour les tests
  const storage = new SqliteRegionStorage(join(temp.current.path, 'regions'))
  const clock = new SystemClock()
  const session = new RegionSession()
  const throttle = new LoginThrottle()
  return {
    registry,
    keys,
    storage,
    session,
    create: new CreateRegionUseCase(registry, keys, storage, new UuidGenerator(), clock, throttle),
    open: new OpenRegionUseCase(registry, keys, storage, session, throttle, clock)
  }
}

async function setUpTwoRegions(app: App): Promise<TwoRegions> {
  const a = await app.create.execute({
    name: 'Région A',
    password: PASSWORD_A,
    passwordConfirmation: PASSWORD_A
  })
  const b = await app.create.execute({
    name: 'Région B',
    password: PASSWORD_B,
    passwordConfirmation: PASSWORD_B
  })
  return { a, b }
}

function savePpmInActiveRegion(app: ReturnType<typeof boot>, object: string): void {
  const { ppms } = app.session.requireWorkspace().repositories
  const ppm = createPpm({
    id: `ppm-${object}`,
    year: 2026,
    number: ppms.nextNumber(2026),
    elaboratedOn: '2026-10-04'
  })
  ppms.save(addPpmLine(ppm, createPpmLine({ id: `l-${object}`, nature: 'TRAVAUX', object })))
}

describe('isolation entre régions (vrais fichiers chiffrés)', () => {
  it('chaque région ne voit que ses propres données', async () => {
    const app = boot()
    const { a, b } = await setUpTwoRegions(app)

    await app.open.execute({ regionId: a.region.id, password: PASSWORD_A })
    savePpmInActiveRegion(app, SECRET_OBJECT)
    expect(app.session.requireWorkspace().repositories.ppms.list()).toHaveLength(1)

    await app.open.execute({ regionId: b.region.id, password: PASSWORD_B })
    expect(app.session.requireWorkspace().repositories.ppms.list()).toEqual([])

    await app.open.execute({ regionId: a.region.id, password: PASSWORD_A })
    expect(app.session.requireWorkspace().repositories.ppms.list()[0]?.lines[0]?.object).toBe(
      SECRET_OBJECT
    )
    app.session.close()
  })

  it('le mot de passe d’une région n’ouvre pas une autre région', async () => {
    const app = boot()
    const { a, b } = await setUpTwoRegions(app)

    await expect(
      app.open.execute({ regionId: a.region.id, password: PASSWORD_B })
    ).rejects.toMatchObject({
      code: 'INVALID_PASSWORD'
    })
    await expect(
      app.open.execute({ regionId: b.region.id, password: PASSWORD_A })
    ).rejects.toMatchObject({
      code: 'INVALID_PASSWORD'
    })
    expect(app.session.current()).toBeNull()
  })

  it('la clé d’une région ne déchiffre pas le fichier d’une autre région', async () => {
    const app = boot()
    const { a, b } = await setUpTwoRegions(app)
    const registeredB = app.registry.find(b.region.id)
    if (!registeredB) throw new Error('région B introuvable')
    const keyB = await app.keys.unlockWithPassword(b.region.id, registeredB.secrets, PASSWORD_B)

    expect(() =>
      openDatabase(join(temp.current.path, 'regions', `${a.region.id}.sqlite`), { key: keyB })
    ).toThrow(DatabaseAccessError)
  })

  it('après déconnexion, plus aucun accès aux données (la base est fermée)', async () => {
    const app = boot()
    const { a } = await setUpTwoRegions(app)
    await app.open.execute({ regionId: a.region.id, password: PASSWORD_A })
    const { ppms } = app.session.requireWorkspace().repositories

    app.session.close()

    expect(() => app.session.requireWorkspace()).toThrowError(
      expect.objectContaining({ code: 'NO_ACTIVE_REGION' }) as Error
    )
    expect(() => ppms.list()).toThrow() // la connexion SQLite est bien fermée
  })

  it('les données et les régions survivent à un redémarrage', async () => {
    const first = boot()
    const { a } = await setUpTwoRegions(first)
    await first.open.execute({ regionId: a.region.id, password: PASSWORD_A })
    savePpmInActiveRegion(first, SECRET_OBJECT)
    first.session.close()

    const second = boot()
    expect(second.registry.list().map((region) => region.name)).toEqual(['Région A', 'Région B'])
    await second.open.execute({ regionId: a.region.id, password: PASSWORD_A })
    expect(second.session.requireWorkspace().repositories.ppms.list()).toHaveLength(1)
    second.session.close()
  })

  it('la clé de récupération ouvre la base, à la place du mot de passe', async () => {
    const app = boot()
    const { a } = await setUpTwoRegions(app)
    await app.open.execute({ regionId: a.region.id, password: PASSWORD_A })
    savePpmInActiveRegion(app, SECRET_OBJECT)
    app.session.close()

    const registered = app.registry.find(a.region.id)
    if (!registered) throw new Error('région A introuvable')
    const recoveredKey = app.keys.unlockWithRecoveryKey(
      a.region.id,
      registered.secrets,
      a.recoveryKey
    )
    const workspace = app.storage.open(a.region.id, recoveredKey)

    expect(workspace.repositories.ppms.list()[0]?.lines[0]?.object).toBe(SECRET_OBJECT)
    workspace.close()
  })

  it('aucune donnée ni secret lisible dans les fichiers du dossier de données', async () => {
    const app = boot()
    const { a } = await setUpTwoRegions(app)
    await app.open.execute({ regionId: a.region.id, password: PASSWORD_A })
    savePpmInActiveRegion(app, SECRET_OBJECT)
    app.session.close()

    const files = [
      join(temp.current.path, 'regions.json'),
      ...readdirSync(join(temp.current.path, 'regions')).map((name) =>
        join(temp.current.path, 'regions', name)
      )
    ]
    const forbidden = [
      SECRET_OBJECT,
      PASSWORD_A,
      PASSWORD_B,
      a.recoveryKey,
      a.recoveryKey.replaceAll('-', '')
    ]
    for (const file of files) {
      const content = readFileSync(file)
      for (const secret of forbidden) {
        expect(content.includes(secret), `${file} contient « ${secret} »`).toBe(false)
      }
    }
  })

  it('une création interrompue ne laisse ni région fantôme ni fichier orphelin', async () => {
    const app = boot()
    await app.create.execute({
      name: 'Région A',
      password: PASSWORD_A,
      passwordConfirmation: PASSWORD_A
    })

    await expect(
      app.create.execute({
        name: 'région a',
        password: PASSWORD_B,
        passwordConfirmation: PASSWORD_B
      })
    ).rejects.toMatchObject({ code: 'REGION_NAME_TAKEN' })

    expect(app.registry.list()).toHaveLength(1)
    expect(readdirSync(join(temp.current.path, 'regions'))).toHaveLength(1)
  })

  it('signale un fichier de données disparu', async () => {
    const app = boot()
    const { a } = await setUpTwoRegions(app)
    app.storage.remove(a.region.id)

    await expect(
      app.open.execute({ regionId: a.region.id, password: PASSWORD_A })
    ).rejects.toMatchObject({
      code: 'REGION_DATA_MISSING'
    })
  })

  it('signale un fichier de données endommagé par un message clair, sans rien exposer', async () => {
    const app = boot()
    const { a } = await setUpTwoRegions(app)
    writeFileSync(
      join(temp.current.path, 'regions', `${a.region.id}.sqlite`),
      'ceci n’est pas une base'
    )

    await expect(
      app.open.execute({ regionId: a.region.id, password: PASSWORD_A })
    ).rejects.toMatchObject({ code: 'REGION_DATA_UNREADABLE' })
    expect(app.session.current()).toBeNull()
  })

  it('refuse d’ouvrir des données enregistrées par une version plus récente de l’application', async () => {
    const app = boot()
    const { a } = await setUpTwoRegions(app)
    const registered = app.registry.find(a.region.id)
    if (!registered) throw new Error('région A introuvable')
    const key = await app.keys.unlockWithPassword(a.region.id, registered.secrets, PASSWORD_A)
    const db = openDatabase(join(temp.current.path, 'regions', `${a.region.id}.sqlite`), { key })
    db.pragma('user_version = 999')
    db.close()

    await expect(
      app.open.execute({ regionId: a.region.id, password: PASSWORD_A })
    ).rejects.toMatchObject({ code: 'APPLICATION_TOO_OLD' })
    expect(app.session.current()).toBeNull()
  })

  it('refuse un identifiant de région qui tenterait de sortir du dossier de données', () => {
    const app = boot()
    expect(() => {
      app.storage.open('../../etc/passwd', Buffer.alloc(32))
    }).toThrow('Identifiant de région invalide')
    expect(() => {
      app.storage.remove('..')
    }).toThrow('Identifiant de région invalide')
  })
})
