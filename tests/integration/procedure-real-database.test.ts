import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LoginThrottle } from '@application/login-throttle'
import { CreatePpmUseCase } from '@application/ppm/create-ppm'
import { RemovePpmLineUseCase } from '@application/ppm/remove-ppm-line'
import { SavePpmLineUseCase } from '@application/ppm/save-ppm-line'
import {
  CreateProcedureUseCase,
  type ProcedureFields
} from '@application/procedures/create-procedure'
import { DeleteProcedureUseCase } from '@application/procedures/delete-procedure'
import { GetProcedureUseCase } from '@application/procedures/get-procedure'
import { ListProceduresUseCase } from '@application/procedures/list-procedures'
import {
  ReopenStepUseCase,
  SaveStepDatesUseCase,
  ValidateStepUseCase
} from '@application/procedures/step-use-cases'
import { UpdateProcedureUseCase } from '@application/procedures/update-procedure'
import { RegionSession } from '@application/region-session'
import { CreateRegionUseCase } from '@application/regions/create-region'
import { OpenRegionUseCase } from '@application/regions/open-region'
import { createCandidate } from '@domain/candidate'
import { createContract } from '@domain/contract'
import { ariary } from '@domain/shared/ariary'
import { DomainError } from '@domain/shared/errors'
import { ScryptRegionKeyService } from '@infrastructure/crypto/scrypt-key-service'
import { JsonRegionRegistry } from '@infrastructure/json-region-registry'
import { SqliteRegionStorage } from '@infrastructure/sqlite/region-storage'
import { SystemClock, UuidGenerator } from '@infrastructure/system-ports'
import { createTempDirectory } from './helpers'

/** Procédures avec les VRAIS composants : cas d'utilisation, session, base SQLite chiffrée. */
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
  readonly removePpmLine: RemovePpmLineUseCase
  readonly create: CreateProcedureUseCase
  readonly update: UpdateProcedureUseCase
  readonly get: GetProcedureUseCase
  readonly list: ListProceduresUseCase
  readonly saveDates: SaveStepDatesUseCase
  readonly validate: ValidateStepUseCase
  readonly reopen: ReopenStepUseCase
  readonly remove: DeleteProcedureUseCase
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
    removePpmLine: new RemovePpmLineUseCase(session),
    create: new CreateProcedureUseCase(session, ids, clock),
    update: new UpdateProcedureUseCase(session),
    get: new GetProcedureUseCase(session),
    list: new ListProceduresUseCase(session),
    saveDates: new SaveStepDatesUseCase(session),
    validate: new ValidateStepUseCase(session, clock),
    reopen: new ReopenStepUseCase(session),
    remove: new DeleteProcedureUseCase(session)
  }
}

const fields = (overrides: Partial<ProcedureFields> = {}): ProcedureFields => ({
  reference: 'DAO-001/2026',
  object: 'Fourniture de mobilier',
  method: 'DAO',
  ppmLineId: null,
  estimatedAmount: 1_500_000,
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

describe('procédures sur une vraie base chiffrée', () => {
  it('une procédure et l’avancement de ses étapes survivent à un redémarrage', async () => {
    const { aId } = await setUp()
    const first = boot()
    await first.openRegion.execute({ regionId: aId, password: PASSWORD_A })
    const { id } = first.create.execute(fields())
    first.saveDates.execute({
      procedureId: id,
      step: 'PUBLICATION',
      plannedDate: '2026-03-01',
      actualDate: '2026-03-02'
    })
    first.validate.execute({ procedureId: id, step: 'PUBLICATION' })
    first.saveDates.execute({
      procedureId: id,
      step: 'OUVERTURE_PLIS',
      plannedDate: '2026-04-01',
      actualDate: null
    })
    first.session.close()

    const second = boot()
    await second.openRegion.execute({ regionId: aId, password: PASSWORD_A })
    const reloaded = second.get.execute({ procedureId: id })

    expect(reloaded).toMatchObject({
      reference: 'DAO-001/2026',
      status: 'IN_PROGRESS',
      validatedCount: 1,
      nextStep: 'OUVERTURE_PLIS',
      estimatedAmount: 1_500_000
    })
    expect(reloaded.steps[0]).toMatchObject({ plannedDate: '2026-03-01', actualDate: '2026-03-02' })
    expect(reloaded.steps[0]?.validatedOn).not.toBeNull()
    expect(reloaded.steps[1]).toMatchObject({
      plannedDate: '2026-04-01',
      actualDate: null,
      validatedOn: null
    })
  })

  it('le mode reste verrouillé après redémarrage, et une réouverture est enregistrée', async () => {
    const { aId } = await setUp()
    const first = boot()
    await first.openRegion.execute({ regionId: aId, password: PASSWORD_A })
    const { id } = first.create.execute(fields())
    first.saveDates.execute({
      procedureId: id,
      step: 'PUBLICATION',
      plannedDate: null,
      actualDate: '2026-03-02'
    })
    first.validate.execute({ procedureId: id, step: 'PUBLICATION' })
    first.session.close()

    const second = boot()
    await second.openRegion.execute({ regionId: aId, password: PASSWORD_A })
    expectFailure(
      () => second.update.execute({ ...fields({ method: 'AOR' }), procedureId: id }),
      'METHOD_LOCKED'
    )

    second.reopen.execute({ procedureId: id, step: 'PUBLICATION' })
    expect(second.get.execute({ procedureId: id }).validatedCount).toBe(0)
    expect(second.update.execute({ ...fields({ method: 'AOR' }), procedureId: id }).method).toBe(
      'AOR'
    )
  })

  it('une procédure de la région A est introuvable depuis la région B', async () => {
    const { aId, bId } = await setUp()
    const app = boot()
    await app.openRegion.execute({ regionId: aId, password: PASSWORD_A })
    const { id } = app.create.execute(fields())
    app.session.close()

    await app.openRegion.execute({ regionId: bId, password: PASSWORD_B })
    expect(app.list.execute()).toEqual([])
    expectFailure(() => app.get.execute({ procedureId: id }), 'PROCEDURE_NOT_FOUND')
    // La même référence reste libre dans la région B : l'unicité est propre à chaque région.
    expect(app.create.execute(fields()).reference).toBe('DAO-001/2026')
  })

  it('la ligne du plan reste rattachée, et empêche la suppression de la ligne', async () => {
    const { aId } = await setUp()
    const app = boot()
    await app.openRegion.execute({ regionId: aId, password: PASSWORD_A })
    const plan = app.createPpm.execute({ year: 2026, elaboratedOn: null })
    const withLine = app.savePpmLine.execute({
      ppmId: plan.id,
      lineId: null,
      nature: 'TRAVAUX',
      object: 'Réhabilitation',
      financing: null,
      accounts: [],
      plannedLaunchDate: null,
      plannedBidOpeningDate: null,
      plannedAwardDate: null,
      beneficiaries: [{ service: 'SRH', amount: 800_000 }],
      method: 'AOR',
      procedureLead: null
    })
    const lineId = withLine.lines[0]?.id ?? ''

    const { id } = app.create.execute(fields({ ppmLineId: lineId, method: 'AOR' }))

    expect(app.get.execute({ procedureId: id }).ppmLine).toMatchObject({
      ppmNumber: 1,
      object: 'Réhabilitation',
      total: 800_000
    })
    expectFailure(() => app.removePpmLine.execute({ ppmId: plan.id, lineId }), 'PPM_LINE_IN_USE')

    app.remove.execute({ procedureId: id })
    expect(app.removePpmLine.execute({ ppmId: plan.id, lineId }).lines).toEqual([]) // libre une fois la procédure supprimée
  })

  it('refuse la suppression d’une procédure liée à un contrat, base à l’appui', async () => {
    const { aId } = await setUp()
    const app = boot()
    await app.openRegion.execute({ regionId: aId, password: PASSWORD_A })
    const { id } = app.create.execute(fields())
    const { candidates, contracts } = app.session.requireWorkspace().repositories
    candidates.save(createCandidate({ id: 'c1', name: 'SARL Alpha' }))
    contracts.save(
      createContract({
        id: 'k1',
        reference: 'M-1',
        kind: 'MARCHE',
        procedureId: id,
        holderId: 'c1',
        object: 'Marché',
        amount: ariary(1000)
      })
    )

    expectFailure(() => {
      app.remove.execute({ procedureId: id })
    }, 'PROCEDURE_IN_USE')
    expect(app.get.execute({ procedureId: id }).reference).toBe('DAO-001/2026')
  })

  it('refuse une référence déjà utilisée dans la même région', async () => {
    const { aId } = await setUp()
    const app = boot()
    await app.openRegion.execute({ regionId: aId, password: PASSWORD_A })
    app.create.execute(fields())
    expectFailure(
      () => app.create.execute(fields({ reference: ' dao-001/2026 ' })),
      'DUPLICATE_REFERENCE'
    )
  })
})
