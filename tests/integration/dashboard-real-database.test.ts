import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CreateCandidateUseCase } from '@application/candidates/candidate-use-cases'
import {
  AddContractEventUseCase,
  CreateContractUseCase
} from '@application/contracts/contract-use-cases'
import { GetDashboardUseCase } from '@application/dashboard/get-dashboard'
import { LoginThrottle } from '@application/login-throttle'
import { CreatePpmUseCase } from '@application/ppm/create-ppm'
import { SavePpmLineUseCase } from '@application/ppm/save-ppm-line'
import { AddBidUseCase, SetAwardUseCase } from '@application/procedures/bid-use-cases'
import { CreateProcedureUseCase } from '@application/procedures/create-procedure'
import { SaveStepDatesUseCase, ValidateStepUseCase } from '@application/procedures/step-use-cases'
import { RegionSession } from '@application/region-session'
import { CreateRegionUseCase } from '@application/regions/create-region'
import { OpenRegionUseCase } from '@application/regions/open-region'
import { ScryptRegionKeyService } from '@infrastructure/crypto/scrypt-key-service'
import { JsonRegionRegistry } from '@infrastructure/json-region-registry'
import { SqliteRegionStorage } from '@infrastructure/sqlite/region-storage'
import { SystemClock, UuidGenerator } from '@infrastructure/system-ports'
import { createTempDirectory } from './helpers'

/** Tableau de bord avec les VRAIS composants : base SQLite chiffrée, cas d'utilisation et session. */
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
  readonly createPpm: CreatePpmUseCase
  readonly savePpmLine: SavePpmLineUseCase
  readonly createCandidate: CreateCandidateUseCase
  readonly createProcedure: CreateProcedureUseCase
  readonly saveDates: SaveStepDatesUseCase
  readonly validate: ValidateStepUseCase
  readonly addBid: AddBidUseCase
  readonly setAward: SetAwardUseCase
  readonly createContract: CreateContractUseCase
  readonly addEvent: AddContractEventUseCase
  readonly dashboard: GetDashboardUseCase
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
    createPpm: new CreatePpmUseCase(session, ids, clock),
    savePpmLine: new SavePpmLineUseCase(session, ids),
    createCandidate: new CreateCandidateUseCase(session, ids),
    createProcedure: new CreateProcedureUseCase(session, ids, clock),
    saveDates: new SaveStepDatesUseCase(session),
    validate: new ValidateStepUseCase(session, clock),
    addBid: new AddBidUseCase(session, ids),
    setAward: new SetAwardUseCase(session),
    createContract: new CreateContractUseCase(session, ids),
    addEvent: new AddContractEventUseCase(session, ids),
    dashboard: new GetDashboardUseCase(session)
  }
}

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

/**
 * Jeu de données de référence : 1 plan de 2 lignes (la 1re lancée), 2 procédures dont une attribuée avec marché
 * (+150 000 d'avenant), 2 candidats, 3 offres dont 1 retenue.
 */
function fillRegion(app: App): void {
  const plan = app.createPpm.execute({ year: 2026, elaboratedOn: null })
  const line = (object: string, amount: number): string => {
    const result = app.savePpmLine.execute({
      ppmId: plan.id,
      lineId: null,
      nature: 'FOURNITURES',
      object,
      financing: null,
      accounts: [],
      plannedLaunchDate: null,
      plannedBidOpeningDate: null,
      plannedAwardDate: null,
      beneficiaries: [{ service: 'SRH', amount }],
      method: 'DAO',
      procedureLead: null
    })
    return result.lines.at(-1)?.id ?? ''
  }
  const lineId = line('Mobilier', 1_000_000)
  line('Véhicule', 3_000_000)

  const alpha = app.createCandidate.execute({
    name: 'SARL Alpha',
    nif: '1',
    stat: null,
    address: null,
    phone: null,
    email: null
  })
  const beta = app.createCandidate.execute({
    name: 'Beta',
    nif: '2',
    stat: null,
    address: null,
    phone: null,
    email: null
  })

  const attributed = app.createProcedure.execute({
    reference: 'DAO-001/2026',
    object: 'Mobilier',
    method: 'DAO',
    ppmLineId: lineId,
    estimatedAmount: 900_000
  }).id
  app.addBid.execute({ procedureId: attributed, candidateId: alpha.id, amount: 800_000 })
  const bids = app.addBid.execute({
    procedureId: attributed,
    candidateId: beta.id,
    amount: 850_000
  })
  app.setAward.execute({ procedureId: attributed, bidId: bids.bids[0]?.id ?? '' })
  ;(['PUBLICATION', 'OUVERTURE_PLIS', 'EVALUATION', 'ATTRIBUTION'] as const).forEach(
    (step, index) => {
      app.saveDates.execute({
        procedureId: attributed,
        step,
        plannedDate: null,
        actualDate: `2026-02-0${String(index + 1)}`
      })
      app.validate.execute({ procedureId: attributed, step })
    }
  )
  const contract = app.createContract.execute({
    kind: 'MARCHE',
    procedureId: attributed,
    reference: 'M-001/2026',
    object: 'Mobilier',
    holderId: alpha.id,
    ppmLineId: lineId,
    amount: 800_000,
    signedOn: '2026-03-01'
  })
  app.addEvent.execute({
    contractId: contract.id,
    kind: 'AVENANT',
    occurredOn: '2026-04-01',
    amountDelta: 150_000,
    note: null
  })

  const other = app.createProcedure.execute({
    reference: 'DCP-002/2026',
    object: 'Fournitures',
    method: 'DCP',
    ppmLineId: null,
    estimatedAmount: 200_000
  }).id
  app.addBid.execute({ procedureId: other, candidateId: beta.id, amount: 190_000 })
}

describe('tableau de bord sur une vraie base chiffrée', () => {
  it('calcule les indicateurs exacts du jeu de données de référence', async () => {
    const { aId } = await setUp()
    const app = boot()
    await app.openRegion.execute({ regionId: aId, password: PASSWORD_A })
    fillRegion(app)

    const result = app.dashboard.execute()

    expect(result.plans).toEqual([
      expect.objectContaining({
        year: 2026,
        lineCount: 2,
        launchedLineCount: 1,
        plannedAmount: 4_000_000,
        contractedAmount: 950_000
      })
    ])
    expect(result.procedures).toEqual({
      total: 2,
      notStarted: 1,
      inProgress: 1,
      completed: 0,
      awarded: 1,
      byMethod: [
        { method: 'DAO', count: 1, estimatedAmount: 900_000 },
        { method: 'DCP', count: 1, estimatedAmount: 200_000 }
      ]
    })
    expect(result.contracts).toMatchObject({
      total: 1,
      initialAmount: 800_000,
      amendmentsAmount: 150_000,
      currentAmount: 950_000
    })
    expect(result.contracts.byStatus).toMatchObject({ NOT_STARTED: 1 })
    expect(result.candidates).toEqual({ total: 2, bids: 3, awardedBids: 1 })
  })

  it('les indicateurs sont identiques après un redémarrage', async () => {
    const { aId } = await setUp()
    const first = boot()
    await first.openRegion.execute({ regionId: aId, password: PASSWORD_A })
    fillRegion(first)
    const before = first.dashboard.execute()
    first.session.close()

    const second = boot()
    await second.openRegion.execute({ regionId: aId, password: PASSWORD_A })

    expect(second.dashboard.execute()).toEqual(before)
  })

  it('une région ne voit jamais les indicateurs d’une autre', async () => {
    const { aId, bId } = await setUp()
    const app = boot()
    await app.openRegion.execute({ regionId: aId, password: PASSWORD_A })
    fillRegion(app)
    app.session.close()

    await app.openRegion.execute({ regionId: bId, password: PASSWORD_B })

    const result = app.dashboard.execute()
    expect(result.plans).toEqual([])
    expect(result.procedures.total).toBe(0)
    expect(result.contracts.total).toBe(0)
    expect(result.candidates.total).toBe(0)
  })
})
