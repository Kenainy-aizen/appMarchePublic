import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ListAlertsUseCase, SaveAlertHorizonUseCase } from '@application/alerts/alert-use-cases'
import { CreateCandidateUseCase } from '@application/candidates/candidate-use-cases'
import { CreateContractUseCase } from '@application/contracts/contract-use-cases'
import { LoginThrottle } from '@application/login-throttle'
import { CreatePpmUseCase } from '@application/ppm/create-ppm'
import { SavePpmLineUseCase } from '@application/ppm/save-ppm-line'
import { AddBidUseCase, SetAwardUseCase } from '@application/procedures/bid-use-cases'
import { CreateProcedureUseCase } from '@application/procedures/create-procedure'
import { SaveStepDatesUseCase, ValidateStepUseCase } from '@application/procedures/step-use-cases'
import { RegionSession } from '@application/region-session'
import { CreateRegionUseCase } from '@application/regions/create-region'
import { OpenRegionUseCase } from '@application/regions/open-region'
import { addDays, parseIsoDate } from '@domain/shared/iso-date'
import { ScryptRegionKeyService } from '@infrastructure/crypto/scrypt-key-service'
import { JsonOrganizationSettings } from '@infrastructure/json-organization-settings'
import { JsonRegionRegistry } from '@infrastructure/json-region-registry'
import { SqliteRegionStorage } from '@infrastructure/sqlite/region-storage'
import { SystemClock, UuidGenerator } from '@infrastructure/system-ports'
import { createTempDirectory } from './helpers'

/** Alertes avec les VRAIS composants : base SQLite chiffrée, réglages sur fichier, horloge système. */
const PASSWORD_A = 'phrase de passe de la région A'
const PASSWORD_B = 'phrase de passe de la région B'

const temp = { current: createTempDirectory() }
beforeEach(() => {
  temp.current = createTempDirectory()
})
afterEach(() => {
  temp.current.cleanup()
})

const clock = new SystemClock()
const today = (): string => clock.today()
const shift = (days: number): string => addDays(parseIsoDate(today()), days)

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
  readonly alerts: ListAlertsUseCase
  readonly saveHorizon: SaveAlertHorizonUseCase
}

function boot(): App {
  const registry = new JsonRegionRegistry(join(temp.current.path, 'regions.json'))
  const settings = new JsonOrganizationSettings(join(temp.current.path, 'settings.json'))
  const keys = new ScryptRegionKeyService({ n: 1024, r: 8, p: 1 })
  const storage = new SqliteRegionStorage(join(temp.current.path, 'regions'))
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
    alerts: new ListAlertsUseCase(session, settings, clock),
    saveHorizon: new SaveAlertHorizonUseCase(settings)
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

/** Remplit la région A : une ligne de plan en retard, une étape à venir, un marché signé il y a 40 jours. */
function fillRegion(app: App): { procedureId: string } {
  const plan = app.createPpm.execute({ year: 2026, elaboratedOn: null })
  app.savePpmLine.execute({
    ppmId: plan.id,
    lineId: null,
    nature: 'FOURNITURES',
    object: 'Mobilier',
    financing: null,
    accounts: [],
    plannedLaunchDate: shift(-3),
    plannedBidOpeningDate: null,
    plannedAwardDate: null,
    beneficiaries: [{ service: 'SRH', amount: 500_000 }],
    method: 'DAO',
    procedureLead: null
  })

  const holder = app.createCandidate.execute({
    name: 'SARL Alpha',
    nif: '1',
    stat: null,
    address: null,
    phone: null,
    email: null
  })
  const procedureId = app.createProcedure.execute({
    reference: 'DAO-001/2026',
    object: 'Fourniture',
    method: 'DAO',
    ppmLineId: null,
    estimatedAmount: null
  }).id
  app.saveDates.execute({
    procedureId,
    step: 'OUVERTURE_PLIS',
    plannedDate: shift(5),
    actualDate: null
  })

  // Procédure attribuée -> marché signé il y a 40 jours, jamais démarré (échéance de démarrage : il y a 10 jours).
  const awardedId = app.createProcedure.execute({
    reference: 'DAO-002/2026',
    object: 'Travaux',
    method: 'DAO',
    ppmLineId: null,
    estimatedAmount: null
  }).id
  const bid = app.addBid.execute({
    procedureId: awardedId,
    candidateId: holder.id,
    amount: 900_000
  })
  app.setAward.execute({ procedureId: awardedId, bidId: bid.bids[0]?.id ?? '' })
  ;(['PUBLICATION', 'OUVERTURE_PLIS', 'EVALUATION', 'ATTRIBUTION'] as const).forEach(
    (step, index) => {
      app.saveDates.execute({
        procedureId: awardedId,
        step,
        plannedDate: null,
        actualDate: shift(-60 + index)
      })
      app.validate.execute({ procedureId: awardedId, step })
    }
  )
  app.createContract.execute({
    kind: 'MARCHE',
    procedureId: awardedId,
    reference: 'M-001/2026',
    object: 'Travaux',
    holderId: holder.id,
    ppmLineId: null,
    amount: 900_000,
    signedOn: shift(-40)
  })
  return { procedureId }
}

describe('alertes sur une vraie base chiffrée', () => {
  it('calcule les trois sortes d’échéances à partir des données réelles', async () => {
    const { aId } = await setUp()
    const app = boot()
    await app.openRegion.execute({ regionId: aId, password: PASSWORD_A })
    const { procedureId } = fillRegion(app)

    const alerts = app.alerts.execute()

    expect(alerts).toMatchObject({
      today: today(),
      horizonDays: 15,
      overdueCount: 2,
      upcomingCount: 1
    })
    expect(alerts.items.map((a) => [a.kind, a.severity, a.daysLeft, a.subject])).toEqual([
      ['CONTRACT_NOT_STARTED', 'OVERDUE', -10, 'M-001/2026'],
      ['PPM_LINE_LAUNCH', 'OVERDUE', -3, 'Plan n° 1 (2026) : Mobilier'],
      ['PROCEDURE_STEP', 'UPCOMING', 5, 'DAO-001/2026']
    ])
    expect(alerts.items[2]?.target).toEqual({ kind: 'PROCEDURE', id: procedureId })
  })

  it('les alertes se recalculent à l’identique après un redémarrage', async () => {
    const { aId } = await setUp()
    const first = boot()
    await first.openRegion.execute({ regionId: aId, password: PASSWORD_A })
    fillRegion(first)
    const before = first.alerts.execute()
    first.session.close()

    const second = boot()
    await second.openRegion.execute({ regionId: aId, password: PASSWORD_A })

    expect(second.alerts.execute()).toEqual(before)
  })

  it('traiter une échéance la fait disparaître (rien n’est stocké)', async () => {
    const { aId } = await setUp()
    const app = boot()
    await app.openRegion.execute({ regionId: aId, password: PASSWORD_A })
    const { procedureId } = fillRegion(app)

    app.saveDates.execute({
      procedureId,
      step: 'OUVERTURE_PLIS',
      plannedDate: shift(200),
      actualDate: null
    })

    expect(app.alerts.execute().upcomingCount).toBe(0)
  })

  it('le délai d’alerte est un réglage général, conservé dans settings.json et appliqué à toute région', async () => {
    const { aId, bId } = await setUp()
    const app = boot()
    await app.openRegion.execute({ regionId: aId, password: PASSWORD_A })
    const { procedureId } = fillRegion(app)
    app.saveDates.execute({
      procedureId,
      step: 'OUVERTURE_PLIS',
      plannedDate: shift(25),
      actualDate: null
    })
    expect(app.alerts.execute().upcomingCount).toBe(0) // 25 jours > 15

    app.saveHorizon.execute({ days: 30 })
    expect(app.alerts.execute()).toMatchObject({ horizonDays: 30, upcomingCount: 1 })

    app.session.close()
    const restarted = boot()
    await restarted.openRegion.execute({ regionId: bId, password: PASSWORD_B })
    expect(restarted.alerts.execute()).toMatchObject({ horizonDays: 30 }) // même réglage dans l'autre région
  })

  it('les alertes de la région A n’apparaissent pas dans la région B', async () => {
    const { aId, bId } = await setUp()
    const app = boot()
    await app.openRegion.execute({ regionId: aId, password: PASSWORD_A })
    fillRegion(app)
    app.session.close()

    await app.openRegion.execute({ regionId: bId, password: PASSWORD_B })

    expect(app.alerts.execute()).toMatchObject({ overdueCount: 0, upcomingCount: 0, items: [] })
  })
})
