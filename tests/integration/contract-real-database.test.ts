import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CreateCandidateUseCase } from '@application/candidates/candidate-use-cases'
import {
  AddContractEventUseCase,
  CreateContractUseCase,
  DeleteContractUseCase,
  GetContractUseCase,
  ListContractableProceduresUseCase,
  ListContractsUseCase,
  RemoveLastContractEventUseCase,
  type ContractFields
} from '@application/contracts/contract-use-cases'
import { LoginThrottle } from '@application/login-throttle'
import { CreatePpmUseCase } from '@application/ppm/create-ppm'
import { RemovePpmLineUseCase } from '@application/ppm/remove-ppm-line'
import { SavePpmLineUseCase } from '@application/ppm/save-ppm-line'
import { AddBidUseCase, SetAwardUseCase } from '@application/procedures/bid-use-cases'
import { CreateProcedureUseCase } from '@application/procedures/create-procedure'
import { DeleteProcedureUseCase } from '@application/procedures/delete-procedure'
import { SaveStepDatesUseCase, ValidateStepUseCase } from '@application/procedures/step-use-cases'
import { RegionSession } from '@application/region-session'
import { CreateRegionUseCase } from '@application/regions/create-region'
import { OpenRegionUseCase } from '@application/regions/open-region'
import { DeleteCandidateUseCase } from '@application/candidates/candidate-use-cases'
import { DomainError } from '@domain/shared/errors'
import { ScryptRegionKeyService } from '@infrastructure/crypto/scrypt-key-service'
import { JsonRegionRegistry } from '@infrastructure/json-region-registry'
import { SqliteRegionStorage } from '@infrastructure/sqlite/region-storage'
import { SystemClock, UuidGenerator } from '@infrastructure/system-ports'
import { createTempDirectory } from './helpers'

/** Contrats et exécution avec les VRAIS composants : cas d'utilisation, session, base SQLite chiffrée. */
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
  readonly deleteCandidate: DeleteCandidateUseCase
  readonly createPpm: CreatePpmUseCase
  readonly savePpmLine: SavePpmLineUseCase
  readonly removePpmLine: RemovePpmLineUseCase
  readonly createProcedure: CreateProcedureUseCase
  readonly deleteProcedure: DeleteProcedureUseCase
  readonly addBid: AddBidUseCase
  readonly setAward: SetAwardUseCase
  readonly saveDates: SaveStepDatesUseCase
  readonly validate: ValidateStepUseCase
  readonly createContract: CreateContractUseCase
  readonly getContract: GetContractUseCase
  readonly listContracts: ListContractsUseCase
  readonly deleteContract: DeleteContractUseCase
  readonly addEvent: AddContractEventUseCase
  readonly removeLastEvent: RemoveLastContractEventUseCase
  readonly contractable: ListContractableProceduresUseCase
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
    deleteCandidate: new DeleteCandidateUseCase(session),
    createPpm: new CreatePpmUseCase(session, ids, clock),
    savePpmLine: new SavePpmLineUseCase(session, ids),
    removePpmLine: new RemovePpmLineUseCase(session),
    createProcedure: new CreateProcedureUseCase(session, ids, clock),
    deleteProcedure: new DeleteProcedureUseCase(session),
    addBid: new AddBidUseCase(session, ids),
    setAward: new SetAwardUseCase(session),
    saveDates: new SaveStepDatesUseCase(session),
    validate: new ValidateStepUseCase(session, clock),
    createContract: new CreateContractUseCase(session, ids),
    getContract: new GetContractUseCase(session),
    listContracts: new ListContractsUseCase(session),
    deleteContract: new DeleteContractUseCase(session),
    addEvent: new AddContractEventUseCase(session, ids),
    removeLastEvent: new RemoveLastContractEventUseCase(session),
    contractable: new ListContractableProceduresUseCase(session)
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

const candidateFields = { stat: null, address: null, phone: null, email: null }

/** Procédure dont l'attribution est validée, attribuée à un nouveau candidat ; renvoie les identifiants utiles. */
function awardedProcedure(
  app: App,
  reference = 'DAO-001/2026',
  ppmLineId: string | null = null
): { procedureId: string; holderId: string } {
  const holderId = app.createCandidate.execute({
    ...candidateFields,
    name: `Titulaire ${reference}`,
    nif: reference
  }).id
  const procedureId = app.createProcedure.execute({
    reference,
    object: `Objet ${reference}`,
    method: 'DAO',
    ppmLineId,
    estimatedAmount: null
  }).id
  const withBid = app.addBid.execute({ procedureId, candidateId: holderId, amount: 900_000 })
  app.setAward.execute({ procedureId, bidId: withBid.bids[0]?.id ?? '' })
  ;(['PUBLICATION', 'OUVERTURE_PLIS', 'EVALUATION', 'ATTRIBUTION'] as const).forEach(
    (step, index) => {
      app.saveDates.execute({
        procedureId,
        step,
        plannedDate: null,
        actualDate: `2026-02-${String(10 + index)}`
      })
      app.validate.execute({ procedureId, step })
    }
  )
  return { procedureId, holderId }
}

const marche = (holderId: string, overrides: Partial<ContractFields> = {}): ContractFields => ({
  reference: 'M-001/2026',
  object: 'Fourniture de mobilier',
  holderId,
  ppmLineId: null,
  amount: 900_000,
  signedOn: '2026-03-01',
  ...overrides
})

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

describe('contrats sur une vraie base chiffrée', () => {
  it('le marché, ses événements et sa situation survivent à un redémarrage', async () => {
    const { aId } = await setUp()
    const first = boot()
    await first.openRegion.execute({ regionId: aId, password: PASSWORD_A })
    const { procedureId, holderId } = awardedProcedure(first)
    const { id } = first.createContract.execute({
      ...marche(holderId),
      kind: 'MARCHE',
      procedureId
    })
    first.addEvent.execute({
      contractId: id,
      kind: 'ORDRE_SERVICE_DEMARRAGE',
      occurredOn: '2026-03-10',
      amountDelta: null,
      note: 'Démarrage des travaux'
    })
    first.addEvent.execute({
      contractId: id,
      kind: 'AVENANT',
      occurredOn: '2026-04-01',
      amountDelta: 150_000,
      note: null
    })
    first.addEvent.execute({
      contractId: id,
      kind: 'RECEPTION_PROVISOIRE',
      occurredOn: '2026-06-01',
      amountDelta: null,
      note: null
    })
    first.session.close()

    const second = boot()
    await second.openRegion.execute({ regionId: aId, password: PASSWORD_A })
    const reloaded = second.getContract.execute({ contractId: id })

    expect(reloaded).toMatchObject({
      kind: 'MARCHE',
      status: 'PROVISIONALLY_RECEIVED',
      amount: 900_000,
      currentAmount: 1_050_000,
      signedOn: '2026-03-01',
      procedure: { id: procedureId, reference: 'DAO-001/2026' },
      allowedEvents: ['RECEPTION_DEFINITIVE'],
      headerLocked: true
    })
    expect(reloaded.events.map((e) => [e.kind, e.occurredOn, e.amountDelta, e.note])).toEqual([
      ['ORDRE_SERVICE_DEMARRAGE', '2026-03-10', null, 'Démarrage des travaux'],
      ['AVENANT', '2026-04-01', 150_000, null],
      ['RECEPTION_PROVISOIRE', '2026-06-01', null, null]
    ])
  })

  it('annuler le dernier événement est enregistré en base, y compris la clôture', async () => {
    const { aId } = await setUp()
    const first = boot()
    await first.openRegion.execute({ regionId: aId, password: PASSWORD_A })
    const holderId = first.createCandidate.execute({
      ...candidateFields,
      name: 'SARL Alpha',
      nif: '1'
    }).id
    const { id } = first.createContract.execute({
      ...marche(holderId),
      kind: 'ACHAT_DIRECT',
      procedureId: null
    })
    const steps = [
      'ORDRE_SERVICE_DEMARRAGE',
      'RECEPTION_PROVISOIRE',
      'RECEPTION_DEFINITIVE',
      'CLOTURE'
    ]
    steps.forEach((kind, index) => {
      first.addEvent.execute({
        contractId: id,
        kind,
        occurredOn: `2026-0${String(4 + index)}-01`,
        amountDelta: null,
        note: null
      })
    })
    expect(first.getContract.execute({ contractId: id }).status).toBe('CLOSED')
    first.removeLastEvent.execute({ contractId: id })
    first.session.close()

    const second = boot()
    await second.openRegion.execute({ regionId: aId, password: PASSWORD_A })
    expect(second.getContract.execute({ contractId: id })).toMatchObject({
      status: 'FINALLY_RECEIVED'
    })
    expect(second.getContract.execute({ contractId: id }).events).toHaveLength(3)
  })

  it('les liens du marché protègent la procédure, le titulaire et la ligne du plan, base à l’appui', async () => {
    const { aId } = await setUp()
    const app = boot()
    await app.openRegion.execute({ regionId: aId, password: PASSWORD_A })
    const plan = app.createPpm.execute({ year: 2026, elaboratedOn: null })
    const withLine = app.savePpmLine.execute({
      ppmId: plan.id,
      lineId: null,
      nature: 'FOURNITURES',
      object: 'Mobilier',
      financing: null,
      accounts: [],
      plannedLaunchDate: null,
      plannedBidOpeningDate: null,
      plannedAwardDate: null,
      beneficiaries: [{ service: 'SRH', amount: 900_000 }],
      method: 'DAO',
      procedureLead: null
    })
    const lineId = withLine.lines[0]?.id ?? ''
    const { procedureId, holderId } = awardedProcedure(app, 'DAO-001/2026', lineId)
    const { id } = app.createContract.execute({
      ...marche(holderId, { ppmLineId: lineId }),
      kind: 'MARCHE',
      procedureId
    })

    expectFailure(() => {
      app.deleteProcedure.execute({ procedureId })
    }, 'PROCEDURE_IN_USE')
    expectFailure(() => {
      app.deleteCandidate.execute({ candidateId: holderId })
    }, 'CANDIDATE_IN_USE')
    expectFailure(() => app.removePpmLine.execute({ ppmId: plan.id, lineId }), 'PPM_LINE_IN_USE')

    // Une fois le marché supprimé (aucun événement), tout se libère.
    app.deleteContract.execute({ contractId: id })
    expect(app.listContracts.execute()).toEqual([])
    app.deleteProcedure.execute({ procedureId })
  })

  it('supprimer un contrat supprime ses événements ; un contrat démarré ne se supprime pas', async () => {
    const { aId } = await setUp()
    const app = boot()
    await app.openRegion.execute({ regionId: aId, password: PASSWORD_A })
    const holderId = app.createCandidate.execute({
      ...candidateFields,
      name: 'SARL Alpha',
      nif: '1'
    }).id
    const { id } = app.createContract.execute({
      ...marche(holderId),
      kind: 'ACHAT_DIRECT',
      procedureId: null
    })
    app.addEvent.execute({
      contractId: id,
      kind: 'ORDRE_SERVICE_DEMARRAGE',
      occurredOn: '2026-03-10',
      amountDelta: null,
      note: null
    })

    expectFailure(() => {
      app.deleteContract.execute({ contractId: id })
    }, 'CONTRACT_HAS_EVENTS')

    app.removeLastEvent.execute({ contractId: id })
    app.deleteContract.execute({ contractId: id })
    expect(app.listContracts.execute()).toEqual([])
  })

  it('un marché se crée une seule fois par procédure, et la procédure cesse d’être proposée', async () => {
    const { aId } = await setUp()
    const app = boot()
    await app.openRegion.execute({ regionId: aId, password: PASSWORD_A })
    const { procedureId, holderId } = awardedProcedure(app)
    expect(app.contractable.execute().map((p) => p.id)).toEqual([procedureId])

    app.createContract.execute({ ...marche(holderId), kind: 'MARCHE', procedureId })

    expect(app.contractable.execute()).toEqual([])
    expectFailure(
      () =>
        app.createContract.execute({
          ...marche(holderId, { reference: 'M-002/2026' }),
          kind: 'MARCHE',
          procedureId
        }),
      'PROCEDURE_ALREADY_CONTRACTED'
    )
  })

  it('les contrats de la région A sont invisibles depuis la région B, et la référence y reste libre', async () => {
    const { aId, bId } = await setUp()
    const app = boot()
    await app.openRegion.execute({ regionId: aId, password: PASSWORD_A })
    const holderA = app.createCandidate.execute({
      ...candidateFields,
      name: 'SARL Alpha',
      nif: '1'
    }).id
    const { id } = app.createContract.execute({
      ...marche(holderA),
      kind: 'ACHAT_DIRECT',
      procedureId: null
    })
    app.session.close()

    await app.openRegion.execute({ regionId: bId, password: PASSWORD_B })
    expect(app.listContracts.execute()).toEqual([])
    expectFailure(() => app.getContract.execute({ contractId: id }), 'CONTRACT_NOT_FOUND')
    const holderB = app.createCandidate.execute({ ...candidateFields, name: 'Beta', nif: '2' }).id
    expect(
      app.createContract.execute({ ...marche(holderB), kind: 'ACHAT_DIRECT', procedureId: null })
        .reference
    ).toBe('M-001/2026')
  })
})
