import { beforeEach, describe, expect, it } from 'vitest'
import {
  AddContractEventUseCase,
  CreateContractUseCase,
  DeleteContractUseCase,
  GetContractUseCase,
  ListContractableProceduresUseCase,
  ListContractsUseCase,
  RemoveLastContractEventUseCase,
  UpdateContractUseCase,
  type ContractFields
} from '@application/contracts/contract-use-cases'
import { AddBidUseCase, SetAwardUseCase } from '@application/procedures/bid-use-cases'
import { CreateProcedureUseCase } from '@application/procedures/create-procedure'
import { GetProcedureUseCase } from '@application/procedures/get-procedure'
import { SaveStepDatesUseCase, ValidateStepUseCase } from '@application/procedures/step-use-cases'
import { RegionSession } from '@application/region-session'
import { CreateCandidateUseCase } from '@application/candidates/candidate-use-cases'
import { DomainError } from '@domain/shared/errors'
import { FakeClock, SequentialIds } from './fakes'
import { type ActiveRegion, openFakeRegion } from './ppm-fakes'

let region: ActiveRegion
let create: CreateContractUseCase
let update: UpdateContractUseCase
let get: GetContractUseCase
let list: ListContractsUseCase
let remove: DeleteContractUseCase
let addEvent: AddContractEventUseCase
let removeLast: RemoveLastContractEventUseCase
let contractable: ListContractableProceduresUseCase
let getProcedure: GetProcedureUseCase
let alphaId: string
let betaId: string
let ids: SequentialIds

/** Crée une procédure dont l'attribution est validée, attribuée au candidat donné. */
function awardedProcedure(reference: string, holderId: string, amount: number): string {
  const clock = new FakeClock()
  const { session } = region
  const procedureId = new CreateProcedureUseCase(session, ids, clock).execute({
    reference,
    object: `Objet ${reference}`,
    method: 'DAO',
    ppmLineId: null,
    estimatedAmount: null
  }).id
  const withBid = new AddBidUseCase(session, ids).execute({
    procedureId,
    candidateId: holderId,
    amount
  })
  new SetAwardUseCase(session).execute({ procedureId, bidId: withBid.bids[0]?.id ?? '' })
  const saveDates = new SaveStepDatesUseCase(session)
  const validate = new ValidateStepUseCase(session, clock)
  ;(['PUBLICATION', 'OUVERTURE_PLIS', 'EVALUATION', 'ATTRIBUTION'] as const).forEach(
    (step, index) => {
      saveDates.execute({
        procedureId,
        step,
        plannedDate: null,
        actualDate: `2026-02-${String(10 + index)}`
      })
      validate.execute({ procedureId, step })
    }
  )
  return procedureId
}

beforeEach(() => {
  region = openFakeRegion()
  ids = new SequentialIds()
  const { session } = region
  create = new CreateContractUseCase(session, ids)
  update = new UpdateContractUseCase(session)
  get = new GetContractUseCase(session)
  list = new ListContractsUseCase(session)
  remove = new DeleteContractUseCase(session)
  addEvent = new AddContractEventUseCase(session, ids)
  removeLast = new RemoveLastContractEventUseCase(session)
  contractable = new ListContractableProceduresUseCase(session)
  getProcedure = new GetProcedureUseCase(session)
  const candidates = new CreateCandidateUseCase(session, ids)
  const base = { stat: null, address: null, phone: null, email: null }
  alphaId = candidates.execute({ ...base, name: 'SARL Alpha', nif: '111' }).id
  betaId = candidates.execute({ ...base, name: 'Beta', nif: '222' }).id
})

const fields = (overrides: Partial<ContractFields> = {}): ContractFields => ({
  reference: 'M-001/2026',
  object: 'Fourniture de mobilier',
  holderId: alphaId,
  ppmLineId: null,
  amount: 1_200_000,
  signedOn: '2026-03-01',
  ...overrides
})

const codeOf = (action: () => unknown): string => {
  try {
    action()
  } catch (error) {
    if (error instanceof DomainError) return error.code
    throw error
  }
  return 'AUCUNE_ERREUR'
}

describe('sans région ouverte', () => {
  it('toutes les commandes répondent NO_ACTIVE_REGION', () => {
    const closed = new RegionSession()
    expect(codeOf(() => new ListContractsUseCase(closed).execute())).toBe('NO_ACTIVE_REGION')
    expect(codeOf(() => new ListContractableProceduresUseCase(closed).execute())).toBe(
      'NO_ACTIVE_REGION'
    )
    expect(codeOf(() => new GetContractUseCase(closed).execute({ contractId: 'x' }))).toBe(
      'NO_ACTIVE_REGION'
    )
  })
})

describe('procédures pouvant devenir un marché', () => {
  it('ne propose que les procédures dont l’attribution est validée, avec l’attributaire et son montant', () => {
    const procedureId = awardedProcedure('DAO-001/2026', alphaId, 900_000)
    // Une procédure non attribuée n'est pas proposée.
    new CreateProcedureUseCase(region.session, ids, new FakeClock()).execute({
      reference: 'DAO-002/2026',
      object: 'Autre',
      method: 'DAO',
      ppmLineId: null,
      estimatedAmount: null
    })

    expect(contractable.execute()).toEqual([
      expect.objectContaining({
        id: procedureId,
        holderId: alphaId,
        holderName: 'SARL Alpha',
        amount: 900_000
      })
    ])
  })

  it('ne propose plus une procédure qui a déjà son marché', () => {
    const procedureId = awardedProcedure('DAO-001/2026', alphaId, 900_000)
    create.execute({ ...fields({ amount: 900_000 }), kind: 'MARCHE', procedureId })
    expect(contractable.execute()).toEqual([])
  })

  it('la vue d’une procédure indique qu’un marché peut être créé, puis lequel', () => {
    const procedureId = awardedProcedure('DAO-001/2026', alphaId, 900_000)
    expect(getProcedure.execute({ procedureId })).toMatchObject({
      canCreateContract: true,
      contract: null
    })

    const created = create.execute({ ...fields({ amount: 900_000 }), kind: 'MARCHE', procedureId })

    expect(getProcedure.execute({ procedureId })).toMatchObject({
      canCreateContract: false,
      contract: { id: created.id, reference: 'M-001/2026' }
    })
  })
})

describe('création d’un marché', () => {
  it('crée un marché pour l’attributaire, non démarré', () => {
    const procedureId = awardedProcedure('DAO-001/2026', alphaId, 900_000)

    const contract = create.execute({ ...fields({ amount: 900_000 }), kind: 'MARCHE', procedureId })

    expect(contract).toMatchObject({
      kind: 'MARCHE',
      holderName: 'SARL Alpha',
      amount: 900_000,
      currentAmount: 900_000,
      status: 'NOT_STARTED',
      procedure: { id: procedureId, reference: 'DAO-001/2026' },
      headerLocked: false
    })
    expect(contract.allowedEvents).toEqual(['ORDRE_SERVICE_DEMARRAGE', 'AVENANT'])
  })

  it('refuse un marché sans procédure, ou pour une procédure inconnue', () => {
    expect(codeOf(() => create.execute({ ...fields(), kind: 'MARCHE', procedureId: null }))).toBe(
      'PROCEDURE_NOT_FOUND'
    )
    expect(
      codeOf(() => create.execute({ ...fields(), kind: 'MARCHE', procedureId: 'absente' }))
    ).toBe('PROCEDURE_NOT_FOUND')
  })

  it('refuse un marché pour une procédure non attribuée', () => {
    const procedure = new CreateProcedureUseCase(
      region.session,
      new SequentialIds(),
      new FakeClock()
    ).execute({
      reference: 'DAO-009/2026',
      object: 'Non attribuée',
      method: 'DAO',
      ppmLineId: null,
      estimatedAmount: null
    })
    expect(
      codeOf(() => create.execute({ ...fields(), kind: 'MARCHE', procedureId: procedure.id }))
    ).toBe('PROCEDURE_NOT_AWARDED')
  })

  it('refuse un titulaire autre que l’attributaire', () => {
    const procedureId = awardedProcedure('DAO-001/2026', alphaId, 900_000)
    expect(
      codeOf(() => create.execute({ ...fields({ holderId: betaId }), kind: 'MARCHE', procedureId }))
    ).toBe('HOLDER_MISMATCH')
    expect(list.execute()).toEqual([])
  })

  it('refuse un second marché pour la même procédure', () => {
    const procedureId = awardedProcedure('DAO-001/2026', alphaId, 900_000)
    create.execute({ ...fields(), kind: 'MARCHE', procedureId })
    expect(
      codeOf(() =>
        create.execute({ ...fields({ reference: 'M-002/2026' }), kind: 'MARCHE', procedureId })
      )
    ).toBe('PROCEDURE_ALREADY_CONTRACTED')
  })
})

describe('conventions et achats directs', () => {
  it('se créent sans procédure, avec n’importe quel titulaire connu', () => {
    const contract = create.execute({
      ...fields({ holderId: betaId }),
      kind: 'ACHAT_DIRECT',
      procedureId: null
    })
    expect(contract).toMatchObject({ kind: 'ACHAT_DIRECT', holderName: 'Beta', procedure: null })
  })

  it('refusent une procédure d’origine', () => {
    const procedureId = awardedProcedure('DAO-001/2026', alphaId, 900_000)
    expect(codeOf(() => create.execute({ ...fields(), kind: 'CONVENTION', procedureId }))).toBe(
      'PROCEDURE_NOT_ALLOWED'
    )
  })
})

describe('règles communes de création', () => {
  it.each([
    ['référence vide', { reference: '  ' }, 'REQUIRED_FIELD'],
    ['objet vide', { object: '' }, 'REQUIRED_FIELD'],
    ['titulaire inconnu', { holderId: 'absent' }, 'CANDIDATE_NOT_FOUND'],
    ['ligne du plan inconnue', { ppmLineId: 'absente' }, 'PPM_LINE_NOT_FOUND'],
    ['montant négatif', { amount: -1 }, 'INVALID_AMOUNT'],
    ['date de signature invalide', { signedOn: '2026-13-01' }, 'INVALID_DATE']
  ] as const)('refuse : %s — et n’enregistre rien', (_label, overrides, code) => {
    expect(
      codeOf(() =>
        create.execute({ ...fields(overrides), kind: 'ACHAT_DIRECT', procedureId: null })
      )
    ).toBe(code)
    expect(list.execute()).toEqual([])
  })

  it('refuse un type inconnu', () => {
    expect(codeOf(() => create.execute({ ...fields(), kind: 'AUTRE', procedureId: null }))).toBe(
      'INVALID_VALUE'
    )
  })

  it('refuse une référence déjà utilisée (majuscules et espaces ignorés)', () => {
    create.execute({ ...fields(), kind: 'ACHAT_DIRECT', procedureId: null })
    expect(
      codeOf(() =>
        create.execute({
          ...fields({ reference: ' m-001/2026 ' }),
          kind: 'ACHAT_DIRECT',
          procedureId: null
        })
      )
    ).toBe('DUPLICATE_CONTRACT_REFERENCE')
  })
})

describe('modification et suppression', () => {
  const direct = (overrides: Partial<ContractFields> = {}): string =>
    create.execute({ ...fields(overrides), kind: 'ACHAT_DIRECT', procedureId: null }).id

  it('modifie l’en-tête d’un achat direct, titulaire compris', () => {
    const id = direct()
    const updated = update.execute({
      ...fields({ reference: 'M-009/2026', holderId: betaId, amount: 2_000_000 }),
      contractId: id
    })
    expect(updated).toMatchObject({
      reference: 'M-009/2026',
      holderName: 'Beta',
      amount: 2_000_000
    })
  })

  it('garde sa propre référence, refuse celle d’un autre contrat', () => {
    const first = direct({ reference: 'A-1' })
    direct({ reference: 'B-2' })
    expect(() =>
      update.execute({ ...fields({ reference: 'A-1', object: 'Nouveau' }), contractId: first })
    ).not.toThrow()
    expect(
      codeOf(() => update.execute({ ...fields({ reference: 'b-2' }), contractId: first }))
    ).toBe('DUPLICATE_CONTRACT_REFERENCE')
  })

  it('refuse de changer le titulaire d’un marché', () => {
    const procedureId = awardedProcedure('DAO-001/2026', alphaId, 900_000)
    const marche = create.execute({ ...fields({ amount: 900_000 }), kind: 'MARCHE', procedureId })
    expect(
      codeOf(() =>
        update.execute({ ...fields({ holderId: betaId, amount: 900_000 }), contractId: marche.id })
      )
    ).toBe('HOLDER_LOCKED')
  })

  it('fige le montant et la signature dès le premier événement', () => {
    const id = direct()
    addEvent.execute({
      contractId: id,
      kind: 'ORDRE_SERVICE_DEMARRAGE',
      occurredOn: '2026-03-10',
      amountDelta: null,
      note: null
    })

    expect(codeOf(() => update.execute({ ...fields({ amount: 5 }), contractId: id }))).toBe(
      'CONTRACT_STARTED'
    )
    expect(update.execute({ ...fields({ object: 'Objet corrigé' }), contractId: id }).object).toBe(
      'Objet corrigé'
    )
  })

  it('supprime un contrat sans événement, refuse sinon', () => {
    const free = direct({ reference: 'LIBRE' })
    remove.execute({ contractId: free })
    expect(list.execute()).toEqual([])

    const started = direct({ reference: 'DEMARRE' })
    addEvent.execute({
      contractId: started,
      kind: 'ORDRE_SERVICE_DEMARRAGE',
      occurredOn: '2026-03-10',
      amountDelta: null,
      note: null
    })
    expect(
      codeOf(() => {
        remove.execute({ contractId: started })
      })
    ).toBe('CONTRACT_HAS_EVENTS')
  })

  it('refuse un contrat inconnu', () => {
    expect(codeOf(() => get.execute({ contractId: 'absent' }))).toBe('CONTRACT_NOT_FOUND')
    expect(
      codeOf(() => {
        remove.execute({ contractId: 'absent' })
      })
    ).toBe('CONTRACT_NOT_FOUND')
  })
})

describe('exécution du contrat', () => {
  const direct = (): string =>
    create.execute({ ...fields(), kind: 'ACHAT_DIRECT', procedureId: null }).id
  const event = (
    contractId: string,
    kind: string,
    occurredOn: string,
    amountDelta: number | null = null
  ): ReturnType<AddContractEventUseCase['execute']> =>
    addEvent.execute({ contractId, kind, occurredOn, amountDelta, note: null })

  it('suit tout le déroulement jusqu’à la clôture', () => {
    const id = direct()

    expect(event(id, 'ORDRE_SERVICE_DEMARRAGE', '2026-03-10').status).toBe('IN_PROGRESS')
    expect(event(id, 'ORDRE_SERVICE_ARRET', '2026-04-01').status).toBe('STOPPED')
    expect(event(id, 'ORDRE_SERVICE_REPRISE', '2026-04-15').status).toBe('IN_PROGRESS')
    expect(event(id, 'RECEPTION_PROVISOIRE', '2026-06-01').status).toBe('PROVISIONALLY_RECEIVED')
    expect(event(id, 'RECEPTION_DEFINITIVE', '2026-12-01').status).toBe('FINALLY_RECEIVED')
    const closed = event(id, 'CLOTURE', '2026-12-15')

    expect(closed).toMatchObject({ status: 'CLOSED', allowedEvents: [], headerLocked: true })
    expect(closed.events.map((e) => e.kind)).toEqual([
      'ORDRE_SERVICE_DEMARRAGE',
      'ORDRE_SERVICE_ARRET',
      'ORDRE_SERVICE_REPRISE',
      'RECEPTION_PROVISOIRE',
      'RECEPTION_DEFINITIVE',
      'CLOTURE'
    ])
  })

  it('cumule les avenants dans le montant actuel, sans toucher au montant initial', () => {
    const id = direct()
    event(id, 'AVENANT', '2026-03-10', 300_000)
    const detail = event(id, 'AVENANT', '2026-03-11', -100_000)
    expect(detail).toMatchObject({ amount: 1_200_000, currentAmount: 1_400_000 })
  })

  it.each([
    ['réception provisoire avant le démarrage', 'RECEPTION_PROVISOIRE', 'EVENT_NOT_ALLOWED'],
    ['événement inconnu', 'AUTRE', 'INVALID_VALUE']
  ] as const)('refuse : %s — et ne modifie rien', (_label, kind, code) => {
    const id = direct()
    expect(codeOf(() => event(id, kind, '2026-03-10'))).toBe(code)
    expect(get.execute({ contractId: id }).events).toEqual([])
  })

  it('refuse un événement sans date de signature', () => {
    const id = create.execute({
      ...fields({ signedOn: null }),
      kind: 'ACHAT_DIRECT',
      procedureId: null
    }).id
    expect(codeOf(() => event(id, 'ORDRE_SERVICE_DEMARRAGE', '2026-03-10'))).toBe(
      'SIGNATURE_REQUIRED'
    )
  })

  it('refuse un avenant qui ramène le montant sous zéro', () => {
    const id = direct()
    expect(codeOf(() => event(id, 'AVENANT', '2026-03-10', -1_200_001))).toBe('AMOUNT_BELOW_ZERO')
  })

  it('annule le dernier événement seulement, et rétablit la situation', () => {
    const id = direct()
    event(id, 'ORDRE_SERVICE_DEMARRAGE', '2026-03-10')
    event(id, 'RECEPTION_PROVISOIRE', '2026-06-01')

    const undone = removeLast.execute({ contractId: id })

    expect(undone.status).toBe('IN_PROGRESS')
    expect(undone.events.map((e) => e.kind)).toEqual(['ORDRE_SERVICE_DEMARRAGE'])
    expect(codeOf(() => removeLast.execute({ contractId: direct2() }))).toBe('NO_EVENT')
  })

  const direct2 = (): string =>
    create.execute({ ...fields({ reference: 'M-VIDE' }), kind: 'ACHAT_DIRECT', procedureId: null })
      .id
})

describe('liens avec les autres modules', () => {
  it('une procédure liée à un marché ne peut pas être supprimée (règle de la Phase 5, désormais effective)', () => {
    const procedureId = awardedProcedure('DAO-001/2026', alphaId, 900_000)
    create.execute({ ...fields(), kind: 'MARCHE', procedureId })
    const { contracts } = region.repositories
    expect(contracts.list().some((c) => c.procedureId === procedureId)).toBe(true)
  })
})
