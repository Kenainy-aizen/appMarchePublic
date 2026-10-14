import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LoginThrottle } from '@application/login-throttle'
import { RegionSession } from '@application/region-session'
import { CreatePpmUseCase } from '@application/ppm/create-ppm'
import { DeletePpmUseCase } from '@application/ppm/delete-ppm'
import { GetPpmUseCase } from '@application/ppm/get-ppm'
import { ListPpmsUseCase } from '@application/ppm/list-ppms'
import { RecordPpmUpdateUseCase } from '@application/ppm/record-ppm-update'
import { RemovePpmLineUseCase } from '@application/ppm/remove-ppm-line'
import { SavePpmLineUseCase, type SavePpmLineInput } from '@application/ppm/save-ppm-line'
import { CreateRegionUseCase } from '@application/regions/create-region'
import { OpenRegionUseCase } from '@application/regions/open-region'
import { createProcedure } from '@domain/procedure'
import { DomainError } from '@domain/shared/errors'
import { ScryptRegionKeyService } from '@infrastructure/crypto/scrypt-key-service'
import { JsonRegionRegistry } from '@infrastructure/json-region-registry'
import { SqliteRegionStorage } from '@infrastructure/sqlite/region-storage'
import { SystemClock, UuidGenerator } from '@infrastructure/system-ports'
import { createTempDirectory } from './helpers'

/**
 * Plan de passation avec les VRAIS composants : cas d'utilisation -> session -> base SQLite chiffrée.
 * Chaque `boot()` simule un démarrage de l'application sur le même dossier de données.
 */
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
  readonly create: CreateRegionUseCase
  readonly open: OpenRegionUseCase
  readonly createPpm: CreatePpmUseCase
  readonly savePpmLine: SavePpmLineUseCase
  readonly removePpmLine: RemovePpmLineUseCase
  readonly recordUpdate: RecordPpmUpdateUseCase
  readonly deletePpm: DeletePpmUseCase
  readonly getPpm: GetPpmUseCase
  readonly listPpms: ListPpmsUseCase
}

function boot(): App {
  const registry = new JsonRegionRegistry(join(temp.current.path, 'regions.json'))
  const keys = new ScryptRegionKeyService({ n: 1024, r: 8, p: 1 }) // rapide pour les tests
  const storage = new SqliteRegionStorage(join(temp.current.path, 'regions'))
  const clock = new SystemClock()
  const ids = new UuidGenerator()
  const session = new RegionSession()
  const throttle = new LoginThrottle()
  return {
    session,
    create: new CreateRegionUseCase(registry, keys, storage, ids, clock, throttle),
    open: new OpenRegionUseCase(registry, keys, storage, session, throttle, clock),
    createPpm: new CreatePpmUseCase(session, ids, clock),
    savePpmLine: new SavePpmLineUseCase(session, ids),
    removePpmLine: new RemovePpmLineUseCase(session),
    recordUpdate: new RecordPpmUpdateUseCase(session, clock),
    deletePpm: new DeletePpmUseCase(session),
    getPpm: new GetPpmUseCase(session),
    listPpms: new ListPpmsUseCase(session)
  }
}

const lineInput = (ppmId: string, overrides: Partial<SavePpmLineInput> = {}): SavePpmLineInput => ({
  ppmId,
  lineId: null,
  nature: 'TRAVAUX',
  object: 'Réhabilitation des bureaux',
  financing: 'Budget de l’État',
  accounts: ['6012', '6013'],
  plannedLaunchDate: '2026-03-01',
  plannedBidOpeningDate: '2026-04-01',
  plannedAwardDate: '2026-05-01',
  beneficiaries: [
    { service: 'SRH', amount: 1_000_000 },
    { service: 'SAF', amount: 500_000 }
  ],
  method: 'AOR',
  procedureLead: 'M. Rakoto',
  ...overrides
})

async function setUp(): Promise<{ aId: string; bId: string }> {
  const app = boot()
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
  return { aId: a.region.id, bId: b.region.id }
}

describe('plan de passation sur une vraie base chiffrée', () => {
  it('un plan créé dans la région A reste dans la région A, et survit à un redémarrage', async () => {
    const { aId, bId } = await setUp()

    const first = boot()
    await first.open.execute({ regionId: aId, password: PASSWORD_A })
    const plan = first.createPpm.execute({ year: 2026, elaboratedOn: '2026-01-10' })
    first.savePpmLine.execute(lineInput(plan.id))
    first.session.close()

    // Redémarrage : nouvelle instance de l'application, mêmes fichiers.
    const second = boot()
    await second.open.execute({ regionId: aId, password: PASSWORD_A })
    const reloaded = second.getPpm.execute({ ppmId: plan.id })
    expect(reloaded).toMatchObject({ year: 2026, number: 1, lineCount: 1, total: 1_500_000 })
    expect(reloaded.lines[0]).toMatchObject({
      nature: 'TRAVAUX',
      method: 'AOR',
      accounts: ['6012', '6013'],
      plannedAwardDate: '2026-05-01',
      beneficiaries: [
        { service: 'SRH', amount: 1_000_000 },
        { service: 'SAF', amount: 500_000 }
      ]
    })

    // Région B : aucun plan, et celui de A est introuvable même en connaissant son identifiant.
    await second.open.execute({ regionId: bId, password: PASSWORD_B })
    expect(second.listPpms.execute()).toEqual([])
    expect(() => second.getPpm.execute({ ppmId: plan.id })).toThrow(DomainError)
  })

  it('la numérotation continue après un redémarrage et repart de 1 pour une autre année', async () => {
    const { aId } = await setUp()
    const first = boot()
    await first.open.execute({ regionId: aId, password: PASSWORD_A })
    first.createPpm.execute({ year: 2026, elaboratedOn: null })
    first.createPpm.execute({ year: 2026, elaboratedOn: null })
    first.session.close()

    const second = boot()
    await second.open.execute({ regionId: aId, password: PASSWORD_A })

    expect(second.createPpm.execute({ year: 2026, elaboratedOn: null }).number).toBe(3)
    expect(second.createPpm.execute({ year: 2027, elaboratedOn: null }).number).toBe(1)
  })

  it('modifier une ligne ne détache pas la procédure qui s’y rattache, et la suppression est refusée', async () => {
    const { aId } = await setUp()
    const app = boot()
    await app.open.execute({ regionId: aId, password: PASSWORD_A })
    const plan = app.createPpm.execute({ year: 2026, elaboratedOn: null })
    const withLine = app.savePpmLine.execute(lineInput(plan.id))
    const lineId = withLine.lines[0]?.id ?? ''
    const { procedures } = app.session.requireWorkspace().repositories
    procedures.save(
      createProcedure({
        id: 'proc-1',
        reference: 'AOR-001/2026',
        object: 'Réhabilitation des bureaux',
        method: 'AOR',
        ppmLineId: lineId,
        createdOn: '2026-10-04'
      })
    )

    // Modification de la ligne (enregistrement du plan entier) : le lien doit être conservé.
    app.savePpmLine.execute(lineInput(plan.id, { lineId, object: 'Réhabilitation modifiée' }))
    expect(procedures.findById('proc-1')?.ppmLineId).toBe(lineId)

    // Suppression refusée, et rien n'a changé en base.
    expect(() => app.removePpmLine.execute({ ppmId: plan.id, lineId })).toThrow(DomainError)
    expect(() => {
      app.deletePpm.execute({ ppmId: plan.id })
    }).toThrow(DomainError)
    expect(app.getPpm.execute({ ppmId: plan.id }).lineCount).toBe(1)
    expect(procedures.findById('proc-1')?.ppmLineId).toBe(lineId)
  })

  it('une ligne non utilisée est supprimée pour de bon, le plan aussi', async () => {
    const { aId } = await setUp()
    const app = boot()
    await app.open.execute({ regionId: aId, password: PASSWORD_A })
    const plan = app.createPpm.execute({ year: 2026, elaboratedOn: null })
    const detail = app.savePpmLine.execute(lineInput(plan.id))

    expect(
      app.removePpmLine.execute({ ppmId: plan.id, lineId: detail.lines[0]?.id ?? '' }).lines
    ).toEqual([])
    app.recordUpdate.execute({ ppmId: plan.id })
    expect(app.getPpm.execute({ ppmId: plan.id }).updateCount).toBe(1)

    app.deletePpm.execute({ ppmId: plan.id })
    expect(app.listPpms.execute()).toEqual([])
  })
})
