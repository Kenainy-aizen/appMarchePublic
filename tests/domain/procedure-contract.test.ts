import { describe, expect, it } from 'vitest'
import { createContract, createContractEvent, currentAmount } from '@domain/contract'
import { addBid, createBid, createProcedure, type Procedure, STEP_KINDS } from '@domain/procedure'
import { ariary } from '@domain/shared/ariary'
import { DomainError } from '@domain/shared/errors'

const newProcedure = (): Procedure =>
  createProcedure({
    id: 'p1',
    reference: 'AOO-001/2026',
    object: 'Fourniture de mobilier',
    method: 'DAO',
    createdOn: '2026-02-10'
  })

describe('procédure', () => {
  it('démarre avec les cinq étapes, dans l’ordre, sans date', () => {
    const procedure = newProcedure()
    expect(procedure.steps.map((step) => step.kind)).toEqual([...STEP_KINDS])
    expect(procedure.steps.every((step) => step.validatedOn === null)).toBe(true)
  })

  it('refuse qu’un candidat dépose deux offres', () => {
    const bid = createBid({ id: 'b1', candidateId: 'c1', amount: ariary(900) })
    const procedure = addBid(newProcedure(), bid)

    expect(procedure.bids).toHaveLength(1)
    expect(() =>
      addBid(procedure, createBid({ id: 'b2', candidateId: 'c1', amount: ariary(800) }))
    ).toThrow(DomainError)
  })
})

describe('contrat', () => {
  const base = {
    id: 'k1',
    reference: 'M-001/2026',
    holderId: 'c1',
    object: 'Fourniture de mobilier',
    amount: ariary(10_000)
  }

  it('exige une procédure pour un marché', () => {
    expect(() => createContract({ ...base, kind: 'MARCHE' })).toThrow(DomainError)
    expect(createContract({ ...base, kind: 'MARCHE', procedureId: 'p1' }).procedureId).toBe('p1')
  })

  it('autorise un achat direct sans procédure', () => {
    expect(createContract({ ...base, kind: 'ACHAT_DIRECT' }).procedureId).toBeNull()
  })

  it('exige une variation de montant pour un avenant et l’ignore ailleurs', () => {
    expect(() =>
      createContractEvent({ id: 'e1', kind: 'AVENANT', occurredOn: '2026-06-01' })
    ).toThrow(DomainError)
    const reception = createContractEvent({
      id: 'e2',
      kind: 'RECEPTION_PROVISOIRE',
      occurredOn: '2026-07-01',
      amountDelta: 500
    })
    expect(reception.amountDelta).toBeNull()
  })

  it('calcule le montant actuel avec les avenants (positifs ou négatifs)', () => {
    const contract = {
      ...createContract({ ...base, kind: 'MARCHE', procedureId: 'p1' }),
      events: [
        createContractEvent({
          id: 'e1',
          kind: 'AVENANT',
          occurredOn: '2026-06-01',
          amountDelta: 2_000
        }),
        createContractEvent({
          id: 'e2',
          kind: 'AVENANT',
          occurredOn: '2026-07-01',
          amountDelta: -500
        })
      ]
    }
    expect(currentAmount(contract)).toBe(11_500)
  })

  it('refuse un montant actuel négatif', () => {
    const contract = {
      ...createContract({ ...base, kind: 'MARCHE', procedureId: 'p1' }),
      events: [
        createContractEvent({
          id: 'e1',
          kind: 'AVENANT',
          occurredOn: '2026-06-01',
          amountDelta: -20_000
        })
      ]
    }
    expect(() => currentAmount(contract)).toThrow(DomainError)
  })
})
