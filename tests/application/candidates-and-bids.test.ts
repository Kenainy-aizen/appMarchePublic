import { beforeEach, describe, expect, it } from 'vitest'
import {
  CreateCandidateUseCase,
  DeleteCandidateUseCase,
  ListCandidatesUseCase,
  UpdateCandidateUseCase,
  type CandidateFields
} from '@application/candidates/candidate-use-cases'
import {
  AddBidUseCase,
  RemoveBidUseCase,
  SetAwardUseCase,
  UpdateBidUseCase
} from '@application/procedures/bid-use-cases'
import { CreateProcedureUseCase } from '@application/procedures/create-procedure'
import { GetProcedureUseCase } from '@application/procedures/get-procedure'
import { ListProceduresUseCase } from '@application/procedures/list-procedures'
import {
  ReopenStepUseCase,
  SaveStepDatesUseCase,
  ValidateStepUseCase
} from '@application/procedures/step-use-cases'
import { RegionSession } from '@application/region-session'
import { createContract } from '@domain/contract'
import { ariary } from '@domain/shared/ariary'
import { DomainError } from '@domain/shared/errors'
import { FakeClock, SequentialIds } from './fakes'
import { type ActiveRegion, openFakeRegion } from './ppm-fakes'

let region: ActiveRegion
let createCandidate: CreateCandidateUseCase
let updateCandidate: UpdateCandidateUseCase
let deleteCandidate: DeleteCandidateUseCase
let listCandidates: ListCandidatesUseCase
let addBid: AddBidUseCase
let updateBid: UpdateBidUseCase
let removeBid: RemoveBidUseCase
let setAward: SetAwardUseCase
let createProcedure: CreateProcedureUseCase
let getProcedure: GetProcedureUseCase
let listProcedures: ListProceduresUseCase
let saveDates: SaveStepDatesUseCase
let validate: ValidateStepUseCase
let reopen: ReopenStepUseCase
let procedureId: string

beforeEach(() => {
  region = openFakeRegion()
  const ids = new SequentialIds()
  const clock = new FakeClock()
  const { session } = region
  createCandidate = new CreateCandidateUseCase(session, ids)
  updateCandidate = new UpdateCandidateUseCase(session)
  deleteCandidate = new DeleteCandidateUseCase(session)
  listCandidates = new ListCandidatesUseCase(session)
  addBid = new AddBidUseCase(session, ids)
  updateBid = new UpdateBidUseCase(session)
  removeBid = new RemoveBidUseCase(session)
  setAward = new SetAwardUseCase(session)
  createProcedure = new CreateProcedureUseCase(session, ids, clock)
  getProcedure = new GetProcedureUseCase(session)
  listProcedures = new ListProceduresUseCase(session)
  saveDates = new SaveStepDatesUseCase(session)
  validate = new ValidateStepUseCase(session, clock)
  reopen = new ReopenStepUseCase(session)
  procedureId = createProcedure.execute({
    reference: 'DAO-001/2026',
    object: 'Fourniture de mobilier',
    method: 'DAO',
    ppmLineId: null,
    estimatedAmount: null
  }).id
})

const fields = (overrides: Partial<CandidateFields> = {}): CandidateFields => ({
  name: 'SARL Alpha',
  nif: '1234567890',
  stat: null,
  address: null,
  phone: null,
  email: null,
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

/** Valide les trois premières étapes pour que l'attribution soit la suivante. */
const reachAttribution = (): void => {
  ;(['PUBLICATION', 'OUVERTURE_PLIS', 'EVALUATION'] as const).forEach((step, index) => {
    saveDates.execute({
      procedureId,
      step,
      plannedDate: null,
      actualDate: `2026-09-${String(10 + index)}`
    })
    validate.execute({ procedureId, step })
  })
  saveDates.execute({
    procedureId,
    step: 'ATTRIBUTION',
    plannedDate: null,
    actualDate: '2026-09-20'
  })
}

describe('sans région ouverte', () => {
  it('toutes les commandes répondent NO_ACTIVE_REGION', () => {
    const closed = new RegionSession()
    expect(codeOf(() => new ListCandidatesUseCase(closed).execute())).toBe('NO_ACTIVE_REGION')
    expect(
      codeOf(() => new CreateCandidateUseCase(closed, new SequentialIds()).execute(fields()))
    ).toBe('NO_ACTIVE_REGION')
    expect(
      codeOf(() => new SetAwardUseCase(closed).execute({ procedureId: 'x', bidId: null }))
    ).toBe('NO_ACTIVE_REGION')
  })
})

describe('candidats', () => {
  it('crée un candidat, nettoie les textes et le retrouve dans la liste', () => {
    const created = createCandidate.execute(
      fields({ name: '  SARL   Alpha ', phone: ' 034 00 000 00 ', email: '  ' })
    )

    expect(created).toMatchObject({
      name: 'SARL   Alpha',
      phone: '034 00 000 00',
      email: null,
      bidCount: 0
    })
    expect(listCandidates.execute().map((candidate) => candidate.id)).toEqual([created.id])
  })

  it.each([
    ['nom vide', { name: '  ' }, 'REQUIRED_FIELD'],
    ['NIF déjà utilisé (espaces et casse ignorés)', { nif: ' 12 34 56 78 90 ' }, 'DUPLICATE_NIF']
  ] as const)('refuse : %s', (_label, overrides, code) => {
    createCandidate.execute(fields())
    expect(codeOf(() => createCandidate.execute(fields({ name: 'Autre', ...overrides })))).toBe(
      code
    )
    expect(listCandidates.execute()).toHaveLength(1)
  })

  it('autorise deux candidats sans NIF, et deux noms identiques avec des NIF différents', () => {
    createCandidate.execute(fields({ nif: null }))
    createCandidate.execute(fields({ nif: null }))
    createCandidate.execute(fields({ nif: '999' }))
    expect(listCandidates.execute()).toHaveLength(3)
  })

  it('modifie un candidat, garde son propre NIF, refuse celui d’un autre', () => {
    const first = createCandidate.execute(fields())
    createCandidate.execute(fields({ name: 'Beta', nif: '555' }))

    const updated = updateCandidate.execute({
      ...fields({ name: 'SARL Alpha Plus' }),
      candidateId: first.id
    })
    expect(updated.name).toBe('SARL Alpha Plus')
    expect(
      codeOf(() => updateCandidate.execute({ ...fields({ nif: '555' }), candidateId: first.id }))
    ).toBe('DUPLICATE_NIF')
    expect(codeOf(() => updateCandidate.execute({ ...fields(), candidateId: 'absent' }))).toBe(
      'CANDIDATE_NOT_FOUND'
    )
  })

  it('supprime un candidat sans offre ni contrat', () => {
    const { id } = createCandidate.execute(fields())
    deleteCandidate.execute({ candidateId: id })
    expect(listCandidates.execute()).toEqual([])
  })

  it('refuse de supprimer un candidat qui a déposé une offre, et compte ses offres', () => {
    const { id } = createCandidate.execute(fields())
    addBid.execute({ procedureId, candidateId: id, amount: 1_000_000 })

    expect(listCandidates.execute()[0]?.bidCount).toBe(1)
    expect(
      codeOf(() => {
        deleteCandidate.execute({ candidateId: id })
      })
    ).toBe('CANDIDATE_IN_USE')
  })

  it('refuse de supprimer le titulaire d’un contrat', () => {
    const { id } = createCandidate.execute(fields())
    region.repositories.contracts.save(
      createContract({
        id: 'k1',
        reference: 'ACH-1',
        kind: 'ACHAT_DIRECT',
        holderId: id,
        object: 'Achat',
        amount: ariary(1000)
      })
    )
    expect(
      codeOf(() => {
        deleteCandidate.execute({ candidateId: id })
      })
    ).toBe('CANDIDATE_IN_USE')
  })
})

describe('offres', () => {
  it('enregistre une offre avec le nom du candidat, une seule par candidat', () => {
    const { id } = createCandidate.execute(fields())

    const detail = addBid.execute({ procedureId, candidateId: id, amount: 900_000 })

    expect(detail.bids).toEqual([
      expect.objectContaining({
        candidateId: id,
        candidateName: 'SARL Alpha',
        amount: 900_000,
        awarded: false
      })
    ])
    expect(codeOf(() => addBid.execute({ procedureId, candidateId: id, amount: 800_000 }))).toBe(
      'DUPLICATE_BID'
    )
  })

  it.each([
    ['candidat inconnu', { candidateId: 'absent', amount: 1 }, 'CANDIDATE_NOT_FOUND'],
    ['montant négatif', { amount: -1 }, 'INVALID_AMOUNT'],
    ['montant décimal', { amount: 1.5 }, 'INVALID_AMOUNT']
  ] as const)('refuse : %s', (_label, overrides, code) => {
    const { id } = createCandidate.execute(fields())
    const input = { procedureId, candidateId: id, ...{ amount: 100 }, ...overrides }
    expect(codeOf(() => addBid.execute(input))).toBe(code)
    expect(getProcedure.execute({ procedureId }).bids).toEqual([])
  })

  it('modifie le montant et retire une offre', () => {
    const a = createCandidate.execute(fields())
    const b = createCandidate.execute(fields({ name: 'Beta', nif: '555' }))
    addBid.execute({ procedureId, candidateId: a.id, amount: 900_000 })
    const two = addBid.execute({ procedureId, candidateId: b.id, amount: 800_000 })
    const [first, second] = two.bids

    expect(
      updateBid.execute({ procedureId, bidId: first?.id ?? '', amount: 750_000 }).bids[0]?.amount
    ).toBe(750_000)
    expect(removeBid.execute({ procedureId, bidId: second?.id ?? '' }).bids).toHaveLength(1)
    expect(codeOf(() => removeBid.execute({ procedureId, bidId: 'absente' }))).toBe('BID_NOT_FOUND')
  })

  it('retient une seule offre à la fois et l’indique dans la liste des procédures', () => {
    const a = createCandidate.execute(fields())
    const b = createCandidate.execute(fields({ name: 'Beta', nif: '555' }))
    addBid.execute({ procedureId, candidateId: a.id, amount: 900_000 })
    const two = addBid.execute({ procedureId, candidateId: b.id, amount: 800_000 })

    const first = setAward.execute({ procedureId, bidId: two.bids[0]?.id ?? '' })
    expect(first.awardedCandidate).toBe('SARL Alpha')

    const second = setAward.execute({ procedureId, bidId: two.bids[1]?.id ?? '' })
    expect(second.bids.map((bid) => bid.awarded)).toEqual([false, true])
    expect(listProcedures.execute()[0]?.awardedCandidate).toBe('Beta')

    expect(setAward.execute({ procedureId, bidId: null }).awardedCandidate).toBeNull()
  })
})

describe('attribution et verrou des offres', () => {
  it('refuse de valider l’attribution sans offre retenue', () => {
    const { id } = createCandidate.execute(fields())
    addBid.execute({ procedureId, candidateId: id, amount: 900_000 })
    reachAttribution()

    expect(codeOf(() => validate.execute({ procedureId, step: 'ATTRIBUTION' }))).toBe(
      'AWARDED_BID_REQUIRED'
    )
    expect(getProcedure.execute({ procedureId }).validatedCount).toBe(3)
  })

  it('valide l’attribution avec une offre retenue, puis verrouille les offres jusqu’à la réouverture', () => {
    const { id } = createCandidate.execute(fields())
    const withBid = addBid.execute({ procedureId, candidateId: id, amount: 900_000 })
    const bidId = withBid.bids[0]?.id ?? ''
    setAward.execute({ procedureId, bidId })
    reachAttribution()

    const validated = validate.execute({ procedureId, step: 'ATTRIBUTION' })
    expect(validated.bidsLocked).toBe(true)
    expect(codeOf(() => updateBid.execute({ procedureId, bidId, amount: 1 }))).toBe('BIDS_LOCKED')
    expect(codeOf(() => removeBid.execute({ procedureId, bidId }))).toBe('BIDS_LOCKED')

    const reopened = reopen.execute({ procedureId, step: 'ATTRIBUTION' })
    expect(reopened.bidsLocked).toBe(false)
    expect(updateBid.execute({ procedureId, bidId, amount: 950_000 }).bids[0]?.amount).toBe(950_000)
  })
})
