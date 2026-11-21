import { describe, expect, it } from 'vitest'
import {
  ALERT_HORIZON_CHOICES,
  CONTRACT_START_DELAY_DAYS,
  computeAlerts,
  countBySeverity,
  DEFAULT_ALERT_HORIZON_DAYS,
  parseAlertHorizon,
  type AlertInput
} from '@domain/alerts'
import { addContractEvent, createContract, type Contract } from '@domain/contract'
import { addPpmLine, createPpm, createPpmLine, type Ppm } from '@domain/ppm'
import {
  addBid,
  createBid,
  createProcedure,
  setAwardedBid,
  setStepDates,
  validateStep,
  type Procedure,
  type StepKind
} from '@domain/procedure'
import { ariary } from '@domain/shared/ariary'
import { DomainError } from '@domain/shared/errors'
import { addDays, daysBetween, parseIsoDate } from '@domain/shared/iso-date'

const TODAY = '2026-06-15'

const procedure = (
  reference: string,
  planned: Partial<Record<StepKind, string>>,
  options: { id?: string; ppmLineId?: string | null; validate?: readonly StepKind[] } = {}
): Procedure => {
  let current = createProcedure({
    id: options.id ?? reference,
    reference,
    object: `Objet ${reference}`,
    method: 'DAO',
    ppmLineId: options.ppmLineId ?? null,
    createdOn: '2026-01-01'
  })
  for (const [kind, date] of Object.entries(planned)) {
    current = setStepDates(current, kind as StepKind, { plannedDate: date, actualDate: null })
  }
  for (const kind of options.validate ?? []) {
    if (kind === 'ATTRIBUTION') {
      current = setAwardedBid(
        addBid(current, createBid({ id: 'b', candidateId: 'c', amount: ariary(1) })),
        'b'
      )
    }
    current = validateStep(
      setStepDates(current, kind, { plannedDate: planned[kind] ?? null, actualDate: '2026-01-02' }),
      kind,
      '2026-01-03'
    )
  }
  return current
}

const plan = (
  launchDates: readonly (string | null)[],
  ids = launchDates.map((_, i) => `l${String(i)}`)
): Ppm => {
  let ppm = createPpm({ id: 'ppm1', year: 2026, number: 1, elaboratedOn: '2026-01-15' })
  launchDates.forEach((date, index) => {
    ppm = addPpmLine(
      ppm,
      createPpmLine({
        id: ids[index] ?? `l${String(index)}`,
        nature: 'FOURNITURES',
        object: `Ligne ${String(index)}`,
        beneficiaries: [{ service: 'SAF', amount: ariary(1000) }],
        plannedLaunchDate: date
      })
    )
  })
  return ppm
}

const marche = (id: string, signedOn: string | null, started = false): Contract => {
  const contract = createContract({
    id,
    reference: `M-${id}`,
    kind: 'MARCHE',
    procedureId: 'p1',
    holderId: 'c1',
    object: 'Marché',
    amount: ariary(1000),
    signedOn
  })
  return started && signedOn !== null
    ? addContractEvent(contract, {
        id: `${id}-os`,
        kind: 'ORDRE_SERVICE_DEMARRAGE',
        occurredOn: signedOn
      })
    : contract
}

const input = (overrides: Partial<AlertInput> = {}): AlertInput => ({
  today: TODAY,
  horizonDays: 15,
  procedures: [],
  ppms: [],
  contracts: [],
  ...overrides
})

describe('dates', () => {
  it('daysBetween et addDays comptent en jours calendaires, y compris à travers les mois, années bissextiles et fins d’année', () => {
    expect(daysBetween(parseIsoDate('2026-06-15'), parseIsoDate('2026-06-20'))).toBe(5)
    expect(daysBetween(parseIsoDate('2026-06-20'), parseIsoDate('2026-06-15'))).toBe(-5)
    expect(daysBetween(parseIsoDate('2026-02-28'), parseIsoDate('2026-03-01'))).toBe(1)
    expect(daysBetween(parseIsoDate('2028-02-28'), parseIsoDate('2028-03-01'))).toBe(2) // année bissextile
    expect(daysBetween(parseIsoDate('2026-12-31'), parseIsoDate('2027-01-01'))).toBe(1)
    expect(addDays(parseIsoDate('2026-12-20'), 30)).toBe('2027-01-19')
    expect(addDays(parseIsoDate('2026-03-01'), -1)).toBe('2026-02-28')
  })
})

describe('délai d’alerte', () => {
  it('propose 7, 15, 30 et 60 jours, 15 par défaut', () => {
    expect([...ALERT_HORIZON_CHOICES]).toEqual([7, 15, 30, 60])
    expect(DEFAULT_ALERT_HORIZON_DAYS).toBe(15)
  })

  it.each([7, 15, 30, 60])('accepte %i jours', (days) => {
    expect(parseAlertHorizon(days)).toBe(days)
  })

  it.each([0, 1, 14, 90, -7, 7.5, Number.NaN])('refuse %s', (days) => {
    expect(() => parseAlertHorizon(days)).toThrow(DomainError)
  })
})

describe('échéances des étapes de procédure', () => {
  it('classe en retard, à venir (jour même et dernier jour de l’horizon compris) ou sans objet', () => {
    const alerts = computeAlerts(
      input({
        procedures: [
          procedure('P-RETARD', { PUBLICATION: '2026-06-14' }),
          procedure('P-JOUR', { PUBLICATION: '2026-06-15' }),
          procedure('P-LIMITE', { PUBLICATION: '2026-06-30' }), // aujourd'hui + 15
          procedure('P-LOIN', { PUBLICATION: '2026-07-01' }) // aujourd'hui + 16
        ]
      })
    )

    expect(alerts.map((a) => [a.subject, a.severity, a.daysLeft])).toEqual([
      ['P-RETARD', 'OVERDUE', -1],
      ['P-JOUR', 'UPCOMING', 0],
      ['P-LIMITE', 'UPCOMING', 15]
    ])
  })

  it('une étape validée ou sans date prévue ne donne aucune alerte', () => {
    const alerts = computeAlerts(
      input({
        procedures: [
          procedure('P-VALIDEE', { PUBLICATION: '2026-06-01' }, { validate: ['PUBLICATION'] }),
          procedure('P-SANS-DATE', {})
        ]
      })
    )
    expect(alerts).toEqual([])
  })

  it('une procédure terminée ne donne aucune alerte', () => {
    const done = procedure(
      'P-FINIE',
      {
        PUBLICATION: '2026-06-01',
        OUVERTURE_PLIS: '2026-06-02',
        EVALUATION: '2026-06-03',
        ATTRIBUTION: '2026-06-04',
        APPROBATION: '2026-06-05'
      },
      { validate: ['PUBLICATION', 'OUVERTURE_PLIS', 'EVALUATION', 'ATTRIBUTION', 'APPROBATION'] }
    )
    expect(computeAlerts(input({ procedures: [done] }))).toEqual([])
  })

  it('donne une alerte par étape non validée, avec l’étape à faire et le lien vers la procédure', () => {
    const alerts = computeAlerts(
      input({
        procedures: [
          procedure(
            'DAO-1',
            { OUVERTURE_PLIS: '2026-06-10', EVALUATION: '2026-06-20' },
            { id: 'p-1' }
          )
        ]
      })
    )

    expect(alerts).toEqual([
      expect.objectContaining({
        key: 'step:p-1:OUVERTURE_PLIS',
        kind: 'PROCEDURE_STEP',
        severity: 'OVERDUE',
        dueOn: '2026-06-10',
        daysLeft: -5,
        subject: 'DAO-1',
        action: 'Ouverture des plis',
        target: { kind: 'PROCEDURE', id: 'p-1' }
      }),
      expect.objectContaining({
        key: 'step:p-1:EVALUATION',
        severity: 'UPCOMING',
        daysLeft: 5,
        action: 'Évaluation des offres'
      })
    ])
  })
})

describe('lancement prévu des lignes du plan', () => {
  it('alerte pour une ligne sans procédure ni contrat, selon sa date de lancement prévue', () => {
    const alerts = computeAlerts(
      input({ ppms: [plan(['2026-06-01', '2026-06-20', '2026-09-01', null])] })
    )

    expect(alerts.map((a) => [a.key, a.severity, a.daysLeft])).toEqual([
      ['launch:ppm1:l0', 'OVERDUE', -14],
      ['launch:ppm1:l1', 'UPCOMING', 5]
    ])
    expect(alerts[0]).toMatchObject({
      kind: 'PPM_LINE_LAUNCH',
      subject: 'Plan n° 1 (2026) : Ligne 0',
      target: { kind: 'PPM', id: 'ppm1' }
    })
  })

  it('aucune alerte quand la ligne a déjà donné lieu à une procédure ou à un contrat', () => {
    const lines = plan(['2026-06-01', '2026-06-02', '2026-06-03'])
    const contract = createContract({
      id: 'k1',
      reference: 'A-1',
      kind: 'ACHAT_DIRECT',
      holderId: 'c1',
      object: 'Achat',
      amount: ariary(1),
      ppmLineId: 'l1'
    })

    const alerts = computeAlerts(
      input({
        ppms: [lines],
        procedures: [procedure('P', {}, { ppmLineId: 'l0' })],
        contracts: [contract]
      })
    )

    expect(alerts.map((a) => a.key)).toEqual(['launch:ppm1:l2'])
  })
})

describe('marché signé non démarré', () => {
  it(`alerte quand l’ordre de service tarde au-delà de ${String(CONTRACT_START_DELAY_DAYS)} jours, ou approche`, () => {
    const alerts = computeAlerts(
      input({
        contracts: [
          marche('retard', '2026-05-01'), // échéance 31/05 : en retard de 15 jours
          marche('proche', '2026-06-01'), // échéance 01/07 : dans 16 jours -> hors horizon de 15
          marche('juste', '2026-05-31') // échéance 30/06 : dans 15 jours
        ]
      })
    )

    expect(alerts.map((a) => [a.key, a.severity, a.daysLeft])).toEqual([
      ['start:retard', 'OVERDUE', -15],
      ['start:juste', 'UPCOMING', 15]
    ])
    expect(alerts[0]).toMatchObject({
      kind: 'CONTRACT_NOT_STARTED',
      subject: 'M-retard',
      action: 'Émettre l’ordre de service de démarrage',
      target: { kind: 'CONTRACT', id: 'retard' }
    })
  })

  it('aucune alerte pour un marché démarré, sans date de signature, ou pour une convention', () => {
    const convention = createContract({
      id: 'conv',
      reference: 'C-1',
      kind: 'CONVENTION',
      holderId: 'c1',
      object: 'Convention',
      amount: ariary(1),
      signedOn: '2026-01-01'
    })
    expect(
      computeAlerts(
        input({
          contracts: [marche('demarre', '2026-01-01', true), marche('non-signe', null), convention]
        })
      )
    ).toEqual([])
  })
})

describe('tri, horizon et comptage', () => {
  const mixed = (): AlertInput =>
    input({
      procedures: [
        procedure('A', { PUBLICATION: '2026-06-25' }), // à venir (10)
        procedure('B', { PUBLICATION: '2026-06-01' }), // retard de 14
        procedure('C', { PUBLICATION: '2026-06-12' }), // retard de 3
        procedure('D', { PUBLICATION: '2026-06-17' }) // à venir (2)
      ]
    })

  it('place les retards d’abord (le plus ancien en tête), puis les échéances à venir (la plus proche en tête)', () => {
    expect(computeAlerts(mixed()).map((a) => a.subject)).toEqual(['B', 'C', 'D', 'A'])
  })

  it('l’horizon ne change que les échéances à venir, jamais les retards', () => {
    expect(computeAlerts({ ...mixed(), horizonDays: 7 }).map((a) => a.subject)).toEqual([
      'B',
      'C',
      'D'
    ])
    expect(computeAlerts({ ...mixed(), horizonDays: 60 }).map((a) => a.subject)).toEqual([
      'B',
      'C',
      'D',
      'A'
    ])
  })

  it('compte les retards et les échéances à venir', () => {
    expect(countBySeverity(computeAlerts(mixed()))).toEqual({ overdue: 2, upcoming: 2 })
    expect(countBySeverity([])).toEqual({ overdue: 0, upcoming: 0 })
  })

  it('refuse une date du jour invalide', () => {
    expect(() => computeAlerts(input({ today: '2026-13-01' }))).toThrow(DomainError)
  })

  it('une même échéance garde la même clé d’un jour à l’autre', () => {
    const procedures = [procedure('A', { PUBLICATION: '2026-06-25' }, { id: 'p-a' })]
    const today = computeAlerts(input({ procedures }))
    const tomorrow = computeAlerts(input({ procedures, today: '2026-06-16' }))
    expect(today[0]?.key).toBe(tomorrow[0]?.key)
    expect(today[0]?.daysLeft).toBe(10)
    expect(tomorrow[0]?.daysLeft).toBe(9)
  })
})
