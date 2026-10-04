import { beforeEach, describe, expect, it } from 'vitest'
import { createCandidate } from '@domain/candidate'
import { type Contract, createContract, createContractEvent } from '@domain/contract'
import { addPpmLine, createPpm, createPpmLine, type PpmLine, recordPpmUpdate } from '@domain/ppm'
import { addBid, createBid, createProcedure, createStep, type Procedure } from '@domain/procedure'
import { ariary } from '@domain/shared/ariary'
import type { SqliteDatabase } from '@infrastructure/sqlite/database'
import { SqliteCandidateRepository } from '@infrastructure/sqlite/repositories/candidate-repository'
import { SqliteContractRepository } from '@infrastructure/sqlite/repositories/contract-repository'
import { SqlitePpmRepository } from '@infrastructure/sqlite/repositories/ppm-repository'
import { SqliteProcedureRepository } from '@infrastructure/sqlite/repositories/procedure-repository'
import { createMigratedDatabase } from './helpers'

let db: SqliteDatabase
let ppms: SqlitePpmRepository
let procedures: SqliteProcedureRepository
let candidates: SqliteCandidateRepository
let contracts: SqliteContractRepository

beforeEach(() => {
  db = createMigratedDatabase()
  ppms = new SqlitePpmRepository(db)
  procedures = new SqliteProcedureRepository(db)
  candidates = new SqliteCandidateRepository(db)
  contracts = new SqliteContractRepository(db)
})

const sampleLine = (id = 'l1'): PpmLine =>
  createPpmLine({
    id,
    nature: 'TRAVAUX',
    object: 'Réhabilitation des bureaux',
    financing: 'Budget de l’État',
    accounts: ['6012', '6013'],
    plannedLaunchDate: '2026-03-01',
    plannedBidOpeningDate: '2026-04-01',
    plannedAwardDate: '2026-05-01',
    beneficiaries: [
      { service: 'SRH', amount: ariary(1_000_000) },
      { service: 'SAF', amount: ariary(500_000) }
    ],
    method: 'AOR',
    procedureLead: 'M. Rakoto'
  })

const sampleProcedure = (
  overrides: Partial<{ id: string; reference: string; ppmLineId: string | null }> = {}
): Procedure =>
  createProcedure({
    id: overrides.id ?? 'p1',
    reference: overrides.reference ?? 'AOR-001/2026',
    object: 'Réhabilitation des bureaux',
    method: 'AOR',
    ppmLineId: overrides.ppmLineId ?? null,
    estimatedAmount: ariary(1_500_000),
    createdOn: '2026-02-01'
  })

describe('SqlitePpmRepository', () => {
  it('retrouve un plan complet à l’identique', () => {
    const ppm = recordPpmUpdate(
      addPpmLine(
        createPpm({ id: 'ppm1', year: 2026, number: 1, elaboratedOn: '2026-01-10' }),
        sampleLine()
      ),
      '2026-02-20'
    )
    ppms.save(ppm)

    expect(ppms.findById('ppm1')).toEqual(ppm)
  })

  it('numérote automatiquement par année', () => {
    expect(ppms.nextNumber(2026)).toBe(1)
    ppms.save(createPpm({ id: 'a', year: 2026, number: 1, elaboratedOn: '2026-01-01' }))
    ppms.save(createPpm({ id: 'b', year: 2026, number: 2, elaboratedOn: '2026-02-01' }))
    expect(ppms.nextNumber(2026)).toBe(3)
    expect(ppms.nextNumber(2027)).toBe(1)
  })

  it('refuse deux plans avec le même numéro la même année', () => {
    ppms.save(createPpm({ id: 'a', year: 2026, number: 1, elaboratedOn: '2026-01-01' }))
    expect(() => {
      ppms.save(createPpm({ id: 'b', year: 2026, number: 1, elaboratedOn: '2026-01-02' }))
    }).toThrow()
  })

  it('supprime les lignes retirées et conserve l’ordre des autres', () => {
    const base = createPpm({ id: 'ppm1', year: 2026, number: 1, elaboratedOn: '2026-01-10' })
    ppms.save(
      addPpmLine(addPpmLine(addPpmLine(base, sampleLine('a')), sampleLine('b')), sampleLine('c'))
    )

    ppms.save(addPpmLine(addPpmLine(base, sampleLine('c')), sampleLine('a')))

    expect(ppms.findById('ppm1')?.lines.map((line) => line.id)).toEqual(['c', 'a'])
  })

  it('garde le lien procédure → ligne quand on réenregistre le plan', () => {
    const base = createPpm({ id: 'ppm1', year: 2026, number: 1, elaboratedOn: '2026-01-10' })
    ppms.save(addPpmLine(base, sampleLine('l1')))
    procedures.save(sampleProcedure({ ppmLineId: 'l1' }))

    ppms.save(recordPpmUpdate(addPpmLine(base, sampleLine('l1')), '2026-03-01'))

    expect(procedures.findById('p1')?.ppmLineId).toBe('l1')
  })

  it('supprime un plan avec ses lignes et ses bénéficiaires', () => {
    ppms.save(
      addPpmLine(
        createPpm({ id: 'ppm1', year: 2026, number: 1, elaboratedOn: '2026-01-10' }),
        sampleLine()
      )
    )
    ppms.delete('ppm1')

    expect(ppms.findById('ppm1')).toBeNull()
    expect(db.prepare('SELECT count(*) AS n FROM ppm_line_beneficiary').get()).toEqual({ n: 0 })
  })
})

describe('SqliteProcedureRepository', () => {
  const withBids = (): Procedure => {
    candidates.save(createCandidate({ id: 'c1', name: 'SARL Alpha' }))
    candidates.save(createCandidate({ id: 'c2', name: 'SARL Beta' }))
    const procedure = sampleProcedure()
    return addBid(
      addBid(procedure, createBid({ id: 'b1', candidateId: 'c1', amount: ariary(1_400_000) })),
      createBid({ id: 'b2', candidateId: 'c2', amount: ariary(1_300_000) })
    )
  }

  it('retrouve une procédure avec ses étapes et ses offres', () => {
    const procedure = {
      ...withBids(),
      steps: [
        createStep({ kind: 'PUBLICATION', plannedDate: '2026-02-10', actualDate: '2026-02-11' }),
        createStep({ kind: 'OUVERTURE_PLIS', plannedDate: '2026-03-10' }),
        createStep({ kind: 'EVALUATION' }),
        createStep({ kind: 'ATTRIBUTION' }),
        createStep({ kind: 'APPROBATION' })
      ]
    }
    procedures.save(procedure)

    expect(procedures.findById('p1')).toEqual(procedure)
  })

  it('permet de changer l’offre retenue dans les deux sens sans violer l’unicité', () => {
    const procedure = withBids()
    const award = (id: string): Procedure => ({
      ...procedure,
      bids: procedure.bids.map((bid) => ({ ...bid, awarded: bid.id === id }))
    })
    const awardedIds = (): string[] =>
      (procedures.findById('p1')?.bids ?? []).filter((bid) => bid.awarded).map((bid) => bid.id)

    procedures.save(award('b1'))
    expect(awardedIds()).toEqual(['b1'])

    procedures.save(award('b2'))
    expect(awardedIds()).toEqual(['b2'])

    // Sens inverse : l'offre qui redevient retenue est écrite AVANT celle qui perd le statut.
    procedures.save(award('b1'))
    expect(awardedIds()).toEqual(['b1'])
  })

  it('refuse deux offres retenues', () => {
    const procedure = withBids()
    expect(() => {
      procedures.save({
        ...procedure,
        bids: procedure.bids.map((bid) => ({ ...bid, awarded: true }))
      })
    }).toThrow()
  })

  it('refuse une référence déjà utilisée', () => {
    procedures.save(sampleProcedure())
    expect(() => {
      procedures.save(sampleProcedure({ id: 'p2' }))
    }).toThrow()
  })

  it('supprime les offres retirées', () => {
    const procedure = withBids()
    procedures.save(procedure)
    procedures.save({ ...procedure, bids: procedure.bids.slice(0, 1) })

    expect(procedures.findById('p1')?.bids).toHaveLength(1)
  })

  it('empêche de supprimer un candidat qui a déposé une offre', () => {
    procedures.save(withBids())
    expect(() => {
      candidates.delete('c1')
    }).toThrow()
  })
})

describe('SqliteCandidateRepository', () => {
  it('enregistre, met à jour et liste par ordre alphabétique', () => {
    candidates.save(createCandidate({ id: 'c2', name: 'beta', phone: '034 00 000 00' }))
    candidates.save(createCandidate({ id: 'c1', name: 'Alpha', nif: '123' }))
    candidates.save(createCandidate({ id: 'c2', name: 'Beta SARL' }))

    expect(candidates.list().map((candidate) => candidate.name)).toEqual(['Alpha', 'Beta SARL'])
    expect(candidates.findById('c2')?.phone).toBeNull()
    expect(candidates.findById('absent')).toBeNull()
  })
})

describe('SqliteContractRepository', () => {
  const prepare = (): void => {
    candidates.save(createCandidate({ id: 'c1', name: 'SARL Alpha' }))
    procedures.save(sampleProcedure())
  }

  const sampleContract = (): Contract => ({
    ...createContract({
      id: 'k1',
      reference: 'M-001/2026',
      kind: 'MARCHE',
      procedureId: 'p1',
      holderId: 'c1',
      object: 'Réhabilitation des bureaux',
      amount: ariary(1_400_000),
      signedOn: '2026-05-20'
    }),
    events: [
      createContractEvent({ id: 'e1', kind: 'ORDRE_SERVICE_DEMARRAGE', occurredOn: '2026-06-01' }),
      createContractEvent({
        id: 'e2',
        kind: 'AVENANT',
        occurredOn: '2026-08-01',
        amountDelta: 100_000,
        note: 'Travaux supplémentaires'
      })
    ]
  })

  it('retrouve un contrat avec ses événements dans l’ordre', () => {
    prepare()
    contracts.save(sampleContract())

    expect(contracts.findById('k1')).toEqual(sampleContract())
  })

  it('empêche de supprimer une procédure déjà liée à un contrat', () => {
    prepare()
    contracts.save(sampleContract())
    expect(() => {
      procedures.delete('p1')
    }).toThrow()
  })

  it('supprime un contrat avec ses événements', () => {
    prepare()
    contracts.save(sampleContract())
    contracts.delete('k1')

    expect(contracts.list()).toEqual([])
    expect(db.prepare('SELECT count(*) AS n FROM contract_event').get()).toEqual({ n: 0 })
  })
})
