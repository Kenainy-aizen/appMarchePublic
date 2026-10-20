import { describe, expect, it } from 'vitest'
import { normalizeNif } from '@domain/candidate'
import {
  addBid,
  bidsLocked,
  createBid,
  createProcedure,
  removeBid,
  reopenStep,
  setAwardedBid,
  setStepDates,
  updateBidAmount,
  validateStep,
  type Procedure
} from '@domain/procedure'
import { ariary } from '@domain/shared/ariary'
import { DomainError } from '@domain/shared/errors'

const fresh = (): Procedure =>
  createProcedure({
    id: 'p1',
    reference: 'DAO-001/2026',
    object: 'Fourniture de mobilier',
    method: 'DAO',
    createdOn: '2026-02-01'
  })

const bid = (id: string, candidateId: string, amount = 1_000): ReturnType<typeof createBid> =>
  createBid({ id, candidateId, amount: ariary(amount) })

const codeOf = (action: () => unknown): string => {
  try {
    action()
  } catch (error) {
    if (error instanceof DomainError) return error.code
    throw error
  }
  return 'AUCUNE_ERREUR'
}

/** Procédure dont les trois premières étapes sont validées, l'attribution étant la suivante. */
const readyForAttribution = (withAward: boolean): Procedure => {
  let procedure = addBid(addBid(fresh(), bid('b1', 'c1', 900)), bid('b2', 'c2', 800))
  if (withAward) procedure = setAwardedBid(procedure, 'b2')
  for (const [index, kind] of (
    ['PUBLICATION', 'OUVERTURE_PLIS', 'EVALUATION'] as const
  ).entries()) {
    const day = `2026-03-${String(10 + index)}`
    procedure = validateStep(
      setStepDates(procedure, kind, { plannedDate: null, actualDate: day }),
      kind,
      day
    )
  }
  return setStepDates(procedure, 'ATTRIBUTION', { plannedDate: null, actualDate: '2026-03-20' })
}

describe('offres', () => {
  it('ajoute plusieurs offres, une seule par candidat', () => {
    const procedure = addBid(addBid(fresh(), bid('b1', 'c1')), bid('b2', 'c2'))
    expect(procedure.bids.map((b) => b.candidateId)).toEqual(['c1', 'c2'])
    expect(codeOf(() => addBid(procedure, bid('b3', 'c1')))).toBe('DUPLICATE_BID')
  })

  it('modifie le montant d’une offre et en retire une', () => {
    const procedure = addBid(addBid(fresh(), bid('b1', 'c1', 900)), bid('b2', 'c2', 800))

    expect(updateBidAmount(procedure, 'b1', ariary(750)).bids[0]?.amount).toBe(750)
    expect(removeBid(procedure, 'b1').bids.map((b) => b.id)).toEqual(['b2'])
    expect(procedure.bids).toHaveLength(2) // l'original n'est pas modifié
  })

  it('refuse de modifier ou retirer une offre inconnue', () => {
    const procedure = addBid(fresh(), bid('b1', 'c1'))
    expect(codeOf(() => updateBidAmount(procedure, 'zzz', ariary(1)))).toBe('BID_NOT_FOUND')
    expect(codeOf(() => removeBid(procedure, 'zzz'))).toBe('BID_NOT_FOUND')
    expect(codeOf(() => setAwardedBid(procedure, 'zzz'))).toBe('BID_NOT_FOUND')
  })
})

describe('offre retenue', () => {
  it('désigne une seule offre retenue : la désignation passe de l’une à l’autre', () => {
    const procedure = addBid(addBid(fresh(), bid('b1', 'c1')), bid('b2', 'c2'))

    const first = setAwardedBid(procedure, 'b1')
    expect(first.bids.map((b) => b.awarded)).toEqual([true, false])

    const second = setAwardedBid(first, 'b2')
    expect(second.bids.map((b) => b.awarded)).toEqual([false, true])
  })

  it('retire la désignation avec null', () => {
    const procedure = setAwardedBid(addBid(fresh(), bid('b1', 'c1')), 'b1')
    expect(setAwardedBid(procedure, null).bids.some((b) => b.awarded)).toBe(false)
  })

  it('retirer l’offre retenue ne laisse aucune offre retenue', () => {
    const procedure = setAwardedBid(addBid(addBid(fresh(), bid('b1', 'c1')), bid('b2', 'c2')), 'b1')
    expect(removeBid(procedure, 'b1').bids.some((b) => b.awarded)).toBe(false)
  })
})

describe('attribution', () => {
  it('exige une offre retenue pour être validée', () => {
    const procedure = readyForAttribution(false)
    expect(codeOf(() => validateStep(procedure, 'ATTRIBUTION', '2026-03-21'))).toBe(
      'AWARDED_BID_REQUIRED'
    )
  })

  it('est validée dès qu’une offre est retenue', () => {
    const procedure = readyForAttribution(true)
    expect(validateStep(procedure, 'ATTRIBUTION', '2026-03-21').steps[3]?.validatedOn).toBe(
      '2026-03-21'
    )
  })

  it('verrouille les offres une fois l’attribution validée', () => {
    const validated = validateStep(readyForAttribution(true), 'ATTRIBUTION', '2026-03-21')

    expect(bidsLocked(validated)).toBe(true)
    expect(codeOf(() => addBid(validated, bid('b3', 'c3')))).toBe('BIDS_LOCKED')
    expect(codeOf(() => updateBidAmount(validated, 'b1', ariary(5)))).toBe('BIDS_LOCKED')
    expect(codeOf(() => removeBid(validated, 'b1'))).toBe('BIDS_LOCKED')
    expect(codeOf(() => setAwardedBid(validated, 'b1'))).toBe('BIDS_LOCKED')
  })

  it('déverrouille les offres quand l’attribution est rouverte', () => {
    const validated = validateStep(readyForAttribution(true), 'ATTRIBUTION', '2026-03-21')
    const reopened = reopenStep(validated, 'ATTRIBUTION')

    expect(bidsLocked(reopened)).toBe(false)
    expect(setAwardedBid(reopened, 'b1').bids[0]?.awarded).toBe(true)
  })
})

describe('normalizeNif', () => {
  it('ignore les espaces et la casse', () => {
    expect(normalizeNif(' 12 345 678 a ')).toBe('12345678A')
    expect(normalizeNif('12345678A')).toBe(normalizeNif('12 345 678 a'))
  })
})
