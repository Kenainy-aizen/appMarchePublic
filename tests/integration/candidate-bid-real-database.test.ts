import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CreateCandidateUseCase,
  DeleteCandidateUseCase,
  ListCandidatesUseCase,
  type CandidateFields
} from '@application/candidates/candidate-use-cases'
import { LoginThrottle } from '@application/login-throttle'
import {
  AddBidUseCase,
  RemoveBidUseCase,
  SetAwardUseCase,
  UpdateBidUseCase
} from '@application/procedures/bid-use-cases'
import { CreateProcedureUseCase } from '@application/procedures/create-procedure'
import { GetProcedureUseCase } from '@application/procedures/get-procedure'
import {
  ReopenStepUseCase,
  SaveStepDatesUseCase,
  ValidateStepUseCase
} from '@application/procedures/step-use-cases'
import { RegionSession } from '@application/region-session'
import { CreateRegionUseCase } from '@application/regions/create-region'
import { OpenRegionUseCase } from '@application/regions/open-region'
import { DomainError } from '@domain/shared/errors'
import { ScryptRegionKeyService } from '@infrastructure/crypto/scrypt-key-service'
import { JsonRegionRegistry } from '@infrastructure/json-region-registry'
import { SqliteRegionStorage } from '@infrastructure/sqlite/region-storage'
import { SystemClock, UuidGenerator } from '@infrastructure/system-ports'
import { createTempDirectory } from './helpers'

/** Candidats et offres avec les VRAIS composants : cas d'utilisation, session, base SQLite chiffrée. */
const PASSWORD_A = 'phrase de passe de la région A'
const PASSWORD_B = 'phrase de passe de la région B'

const temp = { current: createTempDirectory() }
beforeEach(() => {
  temp.current = createTempDirectory()
})
afterEach(() => {
  temp.current.cleanup()
})

interface App {
  readonly session: RegionSession
  readonly createRegion: CreateRegionUseCase
  readonly openRegion: OpenRegionUseCase
  readonly createCandidate: CreateCandidateUseCase
  readonly listCandidates: ListCandidatesUseCase
  readonly deleteCandidate: DeleteCandidateUseCase
  readonly createProcedure: CreateProcedureUseCase
  readonly getProcedure: GetProcedureUseCase
  readonly addBid: AddBidUseCase
  readonly updateBid: UpdateBidUseCase
  readonly removeBid: RemoveBidUseCase
  readonly setAward: SetAwardUseCase
  readonly saveDates: SaveStepDatesUseCase
  readonly validate: ValidateStepUseCase
  readonly reopen: ReopenStepUseCase
}

function boot(): App {
  const registry = new JsonRegionRegistry(join(temp.current.path, 'regions.json'))
  const keys = new ScryptRegionKeyService({ n: 1024, r: 8, p: 1 })
  const storage = new SqliteRegionStorage(join(temp.current.path, 'regions'))
  const clock = new SystemClock()
  const ids = new UuidGenerator()
  const session = new RegionSession()
  const throttle = new LoginThrottle()
  return {
    session,
    createRegion: new CreateRegionUseCase(registry, keys, storage, ids, clock, throttle),
    openRegion: new OpenRegionUseCase(registry, keys, storage, session, throttle, clock),
    createCandidate: new CreateCandidateUseCase(session, ids),
    listCandidates: new ListCandidatesUseCase(session),
    deleteCandidate: new DeleteCandidateUseCase(session),
    createProcedure: new CreateProcedureUseCase(session, ids, clock),
    getProcedure: new GetProcedureUseCase(session),
    addBid: new AddBidUseCase(session, ids),
    updateBid: new UpdateBidUseCase(session),
    removeBid: new RemoveBidUseCase(session),
    setAward: new SetAwardUseCase(session),
    saveDates: new SaveStepDatesUseCase(session),
    validate: new ValidateStepUseCase(session, clock),
    reopen: new ReopenStepUseCase(session)
  }
}

const candidate = (overrides: Partial<CandidateFields> = {}): CandidateFields => ({
  name: 'SARL Alpha',
  nif: '1234567890',
  stat: '47111 11 2020 0 10001',
  address: 'Ankofafa, Fianarantsoa',
  phone: '034 00 000 00',
  email: 'alpha@example.mg',
  ...overrides
})

async function setUp(): Promise<{ aId: string; bId: string }> {
  const app = boot()
  const a = await app.createRegion.execute({
    name: 'Région A',
    password: PASSWORD_A,
    passwordConfirmation: PASSWORD_A
  })
  const b = await app.createRegion.execute({
    name: 'Région B',
    password: PASSWORD_B,
    passwordConfirmation: PASSWORD_B
  })
  return { aId: a.region.id, bId: b.region.id }
}

const newProcedure = (app: App): string =>
  app.createProcedure.execute({
    reference: 'DAO-001/2026',
    object: 'Fourniture de mobilier',
    method: 'DAO',
    ppmLineId: null,
    estimatedAmount: null
  }).id

const expectFailure = (action: () => unknown, code: string): void => {
  try {
    action()
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError)
    expect((error as DomainError).code).toBe(code)
    return
  }
  throw new Error(`Une DomainError « ${code} » était attendue`)
}

describe('candidats et offres sur une vraie base chiffrée', () => {
  it('candidats, offres et offre retenue survivent à un redémarrage', async () => {
    const { aId } = await setUp()
    const first = boot()
    await first.openRegion.execute({ regionId: aId, password: PASSWORD_A })
    const alpha = first.createCandidate.execute(candidate())
    const beta = first.createCandidate.execute(candidate({ name: 'Beta', nif: '555' }))
    const procedureId = newProcedure(first)
    first.addBid.execute({ procedureId, candidateId: alpha.id, amount: 900_000 })
    const withTwo = first.addBid.execute({ procedureId, candidateId: beta.id, amount: 800_000 })
    first.setAward.execute({ procedureId, bidId: withTwo.bids[1]?.id ?? '' })
    first.session.close()

    const second = boot()
    await second.openRegion.execute({ regionId: aId, password: PASSWORD_A })
    const reloaded = second.getProcedure.execute({ procedureId })

    expect(second.listCandidates.execute().map((c) => c.name)).toEqual(['Beta', 'SARL Alpha']) // ordre alphabétique
    expect(second.listCandidates.execute().find((c) => c.name === 'SARL Alpha')).toMatchObject({
      nif: '1234567890',
      phone: '034 00 000 00',
      email: 'alpha@example.mg',
      bidCount: 1
    })
    expect(reloaded.bids.map((bid) => [bid.candidateName, bid.amount, bid.awarded])).toEqual([
      ['SARL Alpha', 900_000, false],
      ['Beta', 800_000, true]
    ])
    expect(reloaded.awardedCandidate).toBe('Beta')
  })

  it('changer l’offre retenue fonctionne en base dans les deux sens (une seule offre retenue)', async () => {
    const { aId } = await setUp()
    const app = boot()
    await app.openRegion.execute({ regionId: aId, password: PASSWORD_A })
    const alpha = app.createCandidate.execute(candidate())
    const beta = app.createCandidate.execute(candidate({ name: 'Beta', nif: '555' }))
    const procedureId = newProcedure(app)
    app.addBid.execute({ procedureId, candidateId: alpha.id, amount: 900_000 })
    const two = app.addBid.execute({ procedureId, candidateId: beta.id, amount: 800_000 })
    const [bidA, bidB] = [two.bids[0]?.id ?? '', two.bids[1]?.id ?? '']

    expect(app.setAward.execute({ procedureId, bidId: bidA }).awardedCandidate).toBe('SARL Alpha')
    expect(app.setAward.execute({ procedureId, bidId: bidB }).awardedCandidate).toBe('Beta')
    expect(app.setAward.execute({ procedureId, bidId: bidA }).awardedCandidate).toBe('SARL Alpha')
    expect(
      app.getProcedure.execute({ procedureId }).bids.filter((bid) => bid.awarded)
    ).toHaveLength(1)
  })

  it('l’attribution exige une offre retenue, verrouille les offres, et la réouverture les libère', async () => {
    const { aId } = await setUp()
    const app = boot()
    await app.openRegion.execute({ regionId: aId, password: PASSWORD_A })
    const { id } = app.createCandidate.execute(candidate())
    const procedureId = newProcedure(app)
    const withBid = app.addBid.execute({ procedureId, candidateId: id, amount: 900_000 })
    const bidId = withBid.bids[0]?.id ?? ''
    ;(['PUBLICATION', 'OUVERTURE_PLIS', 'EVALUATION'] as const).forEach((step, index) => {
      app.saveDates.execute({
        procedureId,
        step,
        plannedDate: null,
        actualDate: `2026-03-${String(10 + index)}`
      })
      app.validate.execute({ procedureId, step })
    })
    app.saveDates.execute({
      procedureId,
      step: 'ATTRIBUTION',
      plannedDate: null,
      actualDate: '2026-03-20'
    })

    expectFailure(
      () => app.validate.execute({ procedureId, step: 'ATTRIBUTION' }),
      'AWARDED_BID_REQUIRED'
    )

    app.setAward.execute({ procedureId, bidId })
    app.validate.execute({ procedureId, step: 'ATTRIBUTION' })
    expectFailure(() => app.removeBid.execute({ procedureId, bidId }), 'BIDS_LOCKED')

    app.reopen.execute({ procedureId, step: 'ATTRIBUTION' })
    expect(app.updateBid.execute({ procedureId, bidId, amount: 850_000 }).bids[0]?.amount).toBe(
      850_000
    )
  })

  it('un candidat qui a déposé une offre ne peut pas être supprimé, base à l’appui ; libre une fois l’offre retirée', async () => {
    const { aId } = await setUp()
    const app = boot()
    await app.openRegion.execute({ regionId: aId, password: PASSWORD_A })
    const { id } = app.createCandidate.execute(candidate())
    const procedureId = newProcedure(app)
    const withBid = app.addBid.execute({ procedureId, candidateId: id, amount: 900_000 })

    expectFailure(() => {
      app.deleteCandidate.execute({ candidateId: id })
    }, 'CANDIDATE_IN_USE')
    expect(app.listCandidates.execute()).toHaveLength(1)

    app.removeBid.execute({ procedureId, bidId: withBid.bids[0]?.id ?? '' })
    app.deleteCandidate.execute({ candidateId: id })
    expect(app.listCandidates.execute()).toEqual([])
  })

  it('les candidats et les offres de la région A sont invisibles depuis la région B', async () => {
    const { aId, bId } = await setUp()
    const app = boot()
    await app.openRegion.execute({ regionId: aId, password: PASSWORD_A })
    app.createCandidate.execute(candidate())
    app.session.close()

    await app.openRegion.execute({ regionId: bId, password: PASSWORD_B })
    expect(app.listCandidates.execute()).toEqual([])
    // Le même NIF reste libre dans la région B : l'unicité est propre à chaque région.
    expect(app.createCandidate.execute(candidate()).nif).toBe('1234567890')
  })
})
