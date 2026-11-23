import { describe, expect, it } from 'vitest'
import { createCandidate } from '@domain/candidate'
import { addContractEvent, createContract, type Contract } from '@domain/contract'
import { computeDashboard, launchRate, type DashboardInput } from '@domain/dashboard'
import { addPpmLine, createPpm, createPpmLine, type Ppm } from '@domain/ppm'
import {
  addBid,
  createBid,
  createProcedure,
  setAwardedBid,
  setStepDates,
  validateStep,
  type Procedure,
  type ProcedureMethod,
  type StepKind
} from '@domain/procedure'
import { ariary } from '@domain/shared/ariary'

const empty: DashboardInput = { ppms: [], procedures: [], contracts: [], candidates: [] }

const plan = (
  id: string,
  year: number,
  number: number,
  lines: readonly (readonly [string, number])[]
): Ppm =>
  lines.reduce(
    (ppm, [lineId, amount]) =>
      addPpmLine(
        ppm,
        createPpmLine({
          id: lineId,
          nature: 'FOURNITURES',
          object: `Ligne ${lineId}`,
          beneficiaries: [{ service: 'SAF', amount: ariary(amount) }]
        })
      ),
    createPpm({ id, year, number, elaboratedOn: `${String(year)}-01-15` })
  )

const procedure = (
  id: string,
  options: {
    method?: ProcedureMethod
    estimated?: number
    ppmLineId?: string | null
    validated?: readonly StepKind[]
    awardedTo?: string
  } = {}
): Procedure => {
  let current = createProcedure({
    id,
    reference: id,
    object: `Objet ${id}`,
    method: options.method ?? 'DAO',
    ppmLineId: options.ppmLineId ?? null,
    estimatedAmount: options.estimated === undefined ? null : ariary(options.estimated),
    createdOn: '2026-01-01'
  })
  if (options.awardedTo !== undefined) {
    current = setAwardedBid(
      addBid(
        current,
        createBid({ id: `${id}-b`, candidateId: options.awardedTo, amount: ariary(1000) })
      ),
      `${id}-b`
    )
  }
  for (const kind of options.validated ?? []) {
    current = validateStep(
      setStepDates(current, kind, { plannedDate: null, actualDate: '2026-02-01' }),
      kind,
      '2026-02-02'
    )
  }
  return current
}

const contract = (
  id: string,
  amount: number,
  options: {
    procedureId?: string | null
    ppmLineId?: string | null
    events?: readonly [string, number | null][]
  } = {}
): Contract => {
  let current = createContract({
    id,
    reference: id,
    kind: options.procedureId ? 'MARCHE' : 'ACHAT_DIRECT',
    procedureId: options.procedureId ?? null,
    ppmLineId: options.ppmLineId ?? null,
    holderId: 'c1',
    object: 'Objet',
    amount: ariary(amount),
    signedOn: '2026-03-01'
  })
  for (const [index, [kind, delta]] of (options.events ?? []).entries()) {
    current = addContractEvent(current, {
      id: `${id}-e${String(index)}`,
      kind: kind as 'AVENANT',
      occurredOn: '2026-04-01',
      amountDelta: delta
    })
  }
  return current
}

describe('région vide', () => {
  it('donne des zéros partout, sans plan', () => {
    expect(computeDashboard(empty)).toEqual({
      plans: [],
      procedures: {
        total: 0,
        notStarted: 0,
        inProgress: 0,
        completed: 0,
        awarded: 0,
        byMethod: []
      },
      contracts: {
        total: 0,
        byStatus: {
          NOT_STARTED: 0,
          IN_PROGRESS: 0,
          STOPPED: 0,
          PROVISIONALLY_RECEIVED: 0,
          FINALLY_RECEIVED: 0,
          CLOSED: 0
        },
        initialAmount: 0,
        amendmentsAmount: 0,
        currentAmount: 0
      },
      candidates: { total: 0, bids: 0, awardedBids: 0 }
    })
  })
})

describe('procédures', () => {
  it('compte par situation : non démarrées, en cours, terminées', () => {
    const all: readonly StepKind[] = [
      'PUBLICATION',
      'OUVERTURE_PLIS',
      'EVALUATION',
      'ATTRIBUTION',
      'APPROBATION'
    ]
    const result = computeDashboard({
      ...empty,
      procedures: [
        procedure('p1'),
        procedure('p2'),
        procedure('p3', { validated: ['PUBLICATION'] }),
        procedure('p4', { awardedTo: 'c1', validated: all })
      ]
    })

    expect(result.procedures).toMatchObject({
      total: 4,
      notStarted: 2,
      inProgress: 1,
      completed: 1
    })
  })

  it('compte les procédures attribuées (attribution validée avec une offre retenue)', () => {
    const upToAward: readonly StepKind[] = [
      'PUBLICATION',
      'OUVERTURE_PLIS',
      'EVALUATION',
      'ATTRIBUTION'
    ]
    const result = computeDashboard({
      ...empty,
      procedures: [
        procedure('attribuee', { awardedTo: 'c1', validated: upToAward }),
        procedure('retenue-seulement', { awardedTo: 'c1' }), // offre retenue mais attribution non validée
        procedure('rien')
      ]
    })

    expect(result.procedures.awarded).toBe(1)
  })

  it('regroupe par mode (seulement les modes utilisés, dans l’ordre habituel) avec le montant estimé', () => {
    const result = computeDashboard({
      ...empty,
      procedures: [
        procedure('a', { method: 'DCP', estimated: 300 }),
        procedure('b', { method: 'DAO', estimated: 1000 }),
        procedure('c', { method: 'DAO', estimated: 500 }),
        procedure('d', { method: 'DAO' }) // sans montant estimé : compté pour 0
      ]
    })

    expect(result.procedures.byMethod).toEqual([
      { method: 'DAO', count: 3, estimatedAmount: 1500 },
      { method: 'DCP', count: 1, estimatedAmount: 300 }
    ])
  })
})

describe('contrats', () => {
  it('compte par situation et totalise montant initial, avenants et montant actuel', () => {
    const result = computeDashboard({
      ...empty,
      contracts: [
        contract('k1', 1000),
        contract('k2', 2000, {
          events: [
            ['ORDRE_SERVICE_DEMARRAGE', null],
            ['AVENANT', 500]
          ]
        }),
        contract('k3', 3000, { events: [['AVENANT', -400]] })
      ]
    })

    expect(result.contracts).toMatchObject({
      total: 3,
      initialAmount: 6000,
      amendmentsAmount: 100, // +500 − 400
      currentAmount: 6100
    })
    expect(result.contracts.byStatus).toMatchObject({ NOT_STARTED: 2, IN_PROGRESS: 1 })
  })
})

describe('candidats et offres', () => {
  it('compte les candidats, les offres reçues et les offres retenues', () => {
    const result = computeDashboard({
      ...empty,
      candidates: [
        createCandidate({ id: 'c1', name: 'A' }),
        createCandidate({ id: 'c2', name: 'B' })
      ],
      procedures: [procedure('p1', { awardedTo: 'c1' }), procedure('p2')]
    })

    expect(result.candidates).toEqual({ total: 2, bids: 1, awardedBids: 1 })
  })
})

describe('réalisation du plan', () => {
  it('compte les lignes lancées (procédure ou contrat) et les montants prévu et contractualisé', () => {
    const result = computeDashboard({
      ...empty,
      ppms: [
        plan('ppm1', 2026, 1, [
          ['l1', 1000],
          ['l2', 2000],
          ['l3', 4000]
        ])
      ],
      procedures: [procedure('p1', { ppmLineId: 'l1' })],
      contracts: [contract('k1', 1800, { ppmLineId: 'l2' })]
    })

    expect(result.plans).toEqual([
      {
        planId: 'ppm1',
        year: 2026,
        number: 1,
        lineCount: 3,
        launchedLineCount: 2,
        launchRatePercent: 67,
        plannedAmount: 7000,
        contractedAmount: 1800
      }
    ])
  })

  it('un marché reprend la ligne de sa procédure d’origine quand il n’en a pas lui-même', () => {
    const result = computeDashboard({
      ...empty,
      ppms: [
        plan('ppm1', 2026, 1, [
          ['l1', 1000],
          ['l2', 2000]
        ])
      ],
      procedures: [procedure('p1', { ppmLineId: 'l1' })],
      contracts: [contract('k1', 900, { procedureId: 'p1' })]
    })

    expect(result.plans[0]).toMatchObject({ launchedLineCount: 1, contractedAmount: 900 })
  })

  it('une ligne reliée à une procédure ET à un contrat n’est comptée qu’une fois', () => {
    const result = computeDashboard({
      ...empty,
      ppms: [plan('ppm1', 2026, 1, [['l1', 1000]])],
      procedures: [procedure('p1', { ppmLineId: 'l1' })],
      contracts: [contract('k1', 900, { procedureId: 'p1', ppmLineId: 'l1' })]
    })

    expect(result.plans[0]?.launchedLineCount).toBe(1)
  })

  it('le montant contractualisé tient compte des avenants et ne compte que les lignes du plan concerné', () => {
    const result = computeDashboard({
      ...empty,
      ppms: [plan('ppm1', 2026, 1, [['l1', 1000]]), plan('ppm2', 2027, 1, [['m1', 5000]])],
      contracts: [
        contract('k1', 900, { ppmLineId: 'l1', events: [['AVENANT', 100]] }),
        contract('k2', 400, { ppmLineId: 'm1' }),
        contract('k3', 777) // sans ligne : hors plans
      ]
    })

    expect(result.plans.map((p) => [p.planId, p.contractedAmount])).toEqual([
      ['ppm1', 1000],
      ['ppm2', 400]
    ])
  })

  it('launchRate donne un pourcentage entier, 0 pour un plan sans ligne', () => {
    expect(launchRate(0, 0)).toBe(0)
    expect(launchRate(3, 1)).toBe(33)
    expect(launchRate(3, 2)).toBe(67)
    expect(launchRate(4, 4)).toBe(100)
  })
})
