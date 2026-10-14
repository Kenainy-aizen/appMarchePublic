import { beforeEach, describe, expect, it } from 'vitest'
import { LoginThrottle } from '@application/login-throttle'
import { RegionSession } from '@application/region-session'
import { CloseRegionUseCase, GetSessionUseCase } from '@application/regions/close-and-get-session'
import { CreateRegionUseCase, type CreateRegionResult } from '@application/regions/create-region'
import { ListRegionsUseCase } from '@application/regions/list-regions'
import { OpenRegionUseCase } from '@application/regions/open-region'
import { RateLimitedError } from '@domain/shared/errors'
import {
  FakeClock,
  FakeKeyService,
  FakeStorage,
  InMemoryOrganizationSettings,
  InMemoryRegistry,
  SequentialIds
} from './fakes'

const PASSWORD = 'une phrase de passe valide'

let registry: InMemoryRegistry
let storage: FakeStorage
let session: RegionSession
let clock: FakeClock
let throttle: LoginThrottle
let create: CreateRegionUseCase
let open: OpenRegionUseCase
let list: ListRegionsUseCase

beforeEach(() => {
  registry = new InMemoryRegistry()
  storage = new FakeStorage()
  session = new RegionSession()
  clock = new FakeClock()
  const keys = new FakeKeyService()
  throttle = new LoginThrottle()
  create = new CreateRegionUseCase(registry, keys, storage, new SequentialIds(), clock, throttle)
  open = new OpenRegionUseCase(registry, keys, storage, session, throttle, clock)
  list = new ListRegionsUseCase(registry, new InMemoryOrganizationSettings())
})

const createRegion = (name: string, password = PASSWORD): Promise<CreateRegionResult> =>
  create.execute({ name, password, passwordConfirmation: password })

describe('CreateRegionUseCase', () => {
  it('crée la région, sa base, et retourne la clé de récupération', async () => {
    const result = await createRegion('  Région   1 ')

    expect(result.region.name).toBe('Région 1')
    expect(result.recoveryKey).toContain('RECOVERY')
    expect(storage.created).toEqual([result.region.id])
    expect(registry.list()).toHaveLength(1)
  })

  it.each([
    [
      'nom vide',
      { name: '   ', password: PASSWORD, passwordConfirmation: PASSWORD },
      'REGION_NAME_REQUIRED'
    ],
    [
      'mot de passe trop court',
      { name: 'R', password: 'court', passwordConfirmation: 'court' },
      'WEAK_PASSWORD'
    ],
    [
      'confirmation différente',
      { name: 'R', password: PASSWORD, passwordConfirmation: `${PASSWORD}!` },
      'PASSWORD_MISMATCH'
    ]
  ])('refuse : %s', async (_label, input, code) => {
    await expect(create.execute(input)).rejects.toMatchObject({ code })
    expect(registry.list()).toHaveLength(0)
    expect(storage.created).toHaveLength(0)
  })

  it('refuse un nom déjà pris, sans tenir compte de la casse ni des accents', async () => {
    await createRegion('Région 1')
    await expect(createRegion('REGION 1')).rejects.toMatchObject({ code: 'REGION_NAME_TAKEN' })
  })

  it('refuse une quatrième région', async () => {
    await createRegion('A', 'mot de passe numéro un')
    await createRegion('B', 'mot de passe numéro deux')
    await createRegion('C', 'mot de passe numéro trois')
    await expect(createRegion('D', 'mot de passe numéro quatre')).rejects.toMatchObject({
      code: 'REGION_LIMIT_REACHED'
    })
  })

  it('refuse un mot de passe déjà utilisé par une autre région, sans rien créer', async () => {
    await createRegion('Région 1')

    await expect(createRegion('Région 2')).rejects.toMatchObject({ code: 'PASSWORD_ALREADY_USED' })

    expect(registry.regions).toHaveLength(1)
    expect(storage.created).toHaveLength(1)
  })

  it('accepte un mot de passe différent de celui des autres régions', async () => {
    await createRegion('Région 1')
    await expect(createRegion('Région 2', 'un mot de passe différent')).resolves.toBeDefined()
  })

  it('ne permet pas d’essayer des mots de passe sans limite via la création de région', async () => {
    await createRegion('Région 1')

    // Chaque essai raté compte comme un échec de connexion sur la région existante.
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const guess = `essai de mot de passe numéro ${attempt}`
      await createRegion(`Candidate ${attempt}`, guess).catch(() => undefined)
      await Promise.resolve()
      registry.regions.splice(1) // on retire la région créée par l'essai pour rester sous la limite
    }

    await expect(createRegion('Autre', 'un sixième essai différent')).rejects.toBeInstanceOf(
      RateLimitedError
    )
    // Même avec le bon mot de passe, la connexion est bloquée : le compteur est partagé avec la connexion.
    const first = registry.regions[0]
    expect(first).toBeDefined()
    await expect(
      open.execute({ regionId: first?.id ?? '', password: PASSWORD })
    ).rejects.toBeInstanceOf(RateLimitedError)
  })

  it('nettoie le fichier de données si l’écriture du registre échoue', async () => {
    registry.failOnAdd = true

    await expect(createRegion('Région 1')).rejects.toThrow('échec simulé du registre')

    expect(storage.removed).toEqual(storage.created)
    expect(registry.list()).toHaveLength(0)
  })

  it('ne laisse pas d’entrée dans le registre si la création de la base échoue', async () => {
    storage.failOnCreate = true
    await expect(createRegion('Région 1')).rejects.toThrow()
    expect(registry.list()).toHaveLength(0)
  })
})

describe('ListRegionsUseCase', () => {
  it('propose « Région 1 » au départ, puis le premier nom libre', async () => {
    expect(list.execute()).toEqual({
      organizationName: null,
      regions: [],
      canCreate: true,
      suggestedName: 'Région 1'
    })

    await createRegion('Région 1')
    await createRegion('Analamanga', 'un autre mot de passe')
    const overview = list.execute()
    expect(overview.suggestedName).toBe('Région 2')
    expect(overview.canCreate).toBe(true)

    await createRegion('Région 2', 'encore un autre mot de passe')
    expect(list.execute().canCreate).toBe(false)
  })

  it('ne renvoie jamais de secret', async () => {
    await createRegion('Région 1')
    expect(JSON.stringify(list.execute())).not.toContain('passwordWrappedKey')
  })
})

describe('OpenRegionUseCase et session', () => {
  it('ouvre la région avec le bon mot de passe', async () => {
    const { region } = await createRegion('Région 1')

    await open.execute({ regionId: region.id, password: PASSWORD })

    expect(new GetSessionUseCase(session).execute()).toEqual(region)
    expect(session.requireWorkspace().regionId).toBe(region.id)
  })

  it('refuse un mauvais mot de passe et n’ouvre rien', async () => {
    const { region } = await createRegion('Région 1')

    await expect(
      open.execute({ regionId: region.id, password: 'mauvais mot de passe' })
    ).rejects.toMatchObject({
      code: 'INVALID_PASSWORD'
    })
    expect(session.current()).toBeNull()
    expect(storage.opened).toHaveLength(0)
  })

  it('refuse une région inconnue', async () => {
    await expect(open.execute({ regionId: 'inconnue', password: PASSWORD })).rejects.toMatchObject({
      code: 'REGION_NOT_FOUND'
    })
  })

  it('ferme la région précédente quand on en ouvre une autre', async () => {
    const a = (await createRegion('A')).region
    const b = (await createRegion('B', 'un autre mot de passe')).region

    await open.execute({ regionId: a.id, password: PASSWORD })
    await open.execute({ regionId: b.id, password: 'un autre mot de passe' })

    expect(storage.opened.map((workspace) => workspace.closed)).toEqual([true, false])
    expect(session.current()).toEqual(b)
  })

  it('garde la région courante si la connexion à une autre échoue', async () => {
    const a = (await createRegion('A')).region
    const b = (await createRegion('B', 'un autre mot de passe')).region
    await open.execute({ regionId: a.id, password: PASSWORD })

    await expect(open.execute({ regionId: b.id, password: PASSWORD })).rejects.toThrow()

    expect(session.current()).toEqual(a)
    expect(storage.opened[0]?.closed).toBe(false)
  })

  it('se déconnecte : la base est fermée et plus aucun accès n’est possible', async () => {
    const { region } = await createRegion('Région 1')
    await open.execute({ regionId: region.id, password: PASSWORD })

    new CloseRegionUseCase(session).execute()

    expect(storage.opened[0]?.closed).toBe(true)
    expect(session.current()).toBeNull()
    expect(() => session.requireWorkspace()).toThrowError(
      expect.objectContaining({ code: 'NO_ACTIVE_REGION' }) as Error
    )
  })

  it('signale un fichier de données manquant', async () => {
    const { region } = await createRegion('Région 1')
    storage.missing = true

    await expect(open.execute({ regionId: region.id, password: PASSWORD })).rejects.toMatchObject({
      code: 'REGION_DATA_MISSING'
    })
    expect(session.current()).toBeNull()
  })
})

describe('limitation des essais', () => {
  it('bloque 30 secondes après 5 échecs, même avec le bon mot de passe, puis réautorise', async () => {
    const { region } = await createRegion('Région 1')
    const wrong = { regionId: region.id, password: 'mauvais mot de passe' }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(open.execute(wrong)).rejects.toMatchObject({ code: 'INVALID_PASSWORD' })
    }
    await expect(open.execute({ regionId: region.id, password: PASSWORD })).rejects.toBeInstanceOf(
      RateLimitedError
    )

    clock.ms += 31_000
    await expect(open.execute({ regionId: region.id, password: PASSWORD })).resolves.toEqual(region)
  })

  it('double le délai à chaque échec suivant, plafonné à 5 minutes', () => {
    const throttle = new LoginThrottle()
    let now = 0
    const lockSeconds = (): number => {
      try {
        throttle.assertAllowed('r', now)
        return 0
      } catch (error) {
        return (error as RateLimitedError).retryAfterSeconds
      }
    }

    for (let failure = 1; failure <= 4; failure += 1) throttle.recordFailure('r', now)
    expect(lockSeconds()).toBe(0)
    throttle.recordFailure('r', now) // 5e
    expect(lockSeconds()).toBe(30)
    now += 31_000
    throttle.recordFailure('r', now) // 6e
    expect(lockSeconds()).toBe(60)
    for (let failure = 0; failure < 10; failure += 1) {
      now += 301_000
      throttle.recordFailure('r', now)
    }
    expect(lockSeconds()).toBe(300)
  })

  it('compte les échecs région par région et se remet à zéro après un succès', () => {
    const throttle = new LoginThrottle()
    for (let failure = 0; failure < 5; failure += 1) throttle.recordFailure('a', 0)

    expect(() => {
      throttle.assertAllowed('b', 1)
    }).not.toThrow()
    expect(() => {
      throttle.assertAllowed('a', 1)
    }).toThrow(RateLimitedError)

    throttle.recordSuccess('a')
    expect(() => {
      throttle.assertAllowed('a', 1)
    }).not.toThrow()
  })
})
