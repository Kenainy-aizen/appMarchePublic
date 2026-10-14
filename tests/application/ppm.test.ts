import { beforeEach, describe, expect, it } from 'vitest'
import { RegionSession } from '@application/region-session'
import { CreatePpmUseCase } from '@application/ppm/create-ppm'
import { DeletePpmUseCase } from '@application/ppm/delete-ppm'
import { GetPpmUseCase } from '@application/ppm/get-ppm'
import { ListPpmsUseCase } from '@application/ppm/list-ppms'
import { RecordPpmUpdateUseCase } from '@application/ppm/record-ppm-update'
import { RemovePpmLineUseCase } from '@application/ppm/remove-ppm-line'
import { SavePpmLineUseCase, type SavePpmLineInput } from '@application/ppm/save-ppm-line'
import { createContract } from '@domain/contract'
import { createProcedure } from '@domain/procedure'
import { ariary } from '@domain/shared/ariary'
import { DomainError } from '@domain/shared/errors'
import { FakeClock, SequentialIds } from './fakes'
import { type ActiveRegion, openFakeRegion } from './ppm-fakes'

let region: ActiveRegion
let create: CreatePpmUseCase
let get: GetPpmUseCase
let list: ListPpmsUseCase
let saveLine: SavePpmLineUseCase
let removeLine: RemovePpmLineUseCase
let recordUpdate: RecordPpmUpdateUseCase
let deletePpm: DeletePpmUseCase

beforeEach(() => {
  region = openFakeRegion()
  const ids = new SequentialIds()
  const clock = new FakeClock() // aujourd'hui = 2026-10-04
  const { session } = region
  create = new CreatePpmUseCase(session, ids, clock)
  get = new GetPpmUseCase(session)
  list = new ListPpmsUseCase(session)
  saveLine = new SavePpmLineUseCase(session, ids)
  removeLine = new RemovePpmLineUseCase(session)
  recordUpdate = new RecordPpmUpdateUseCase(session, clock)
  deletePpm = new DeletePpmUseCase(session)
})

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

const expectDomainError = (action: () => unknown, code: string): void => {
  try {
    action()
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError)
    expect((error as DomainError).code).toBe(code)
    return
  }
  throw new Error(`Une DomainError « ${code} » était attendue`)
}

describe('sans région ouverte', () => {
  it('toutes les commandes répondent NO_ACTIVE_REGION', () => {
    const closed = new RegionSession()
    const ids = new SequentialIds()
    const clock = new FakeClock()
    expectDomainError(() => new ListPpmsUseCase(closed).execute(), 'NO_ACTIVE_REGION')
    expectDomainError(
      () => new CreatePpmUseCase(closed, ids, clock).execute({ year: 2026, elaboratedOn: null }),
      'NO_ACTIVE_REGION'
    )
    expectDomainError(() => new GetPpmUseCase(closed).execute({ ppmId: 'x' }), 'NO_ACTIVE_REGION')
    expectDomainError(() => {
      new DeletePpmUseCase(closed).execute({ ppmId: 'x' })
    }, 'NO_ACTIVE_REGION')
  })
})

describe('CreatePpmUseCase', () => {
  it('numérote automatiquement au sein de l’année', () => {
    expect(create.execute({ year: 2026, elaboratedOn: null }).number).toBe(1)
    expect(create.execute({ year: 2026, elaboratedOn: null }).number).toBe(2)
    expect(create.execute({ year: 2027, elaboratedOn: null }).number).toBe(1)
  })

  it('prend la date du jour par défaut, ou celle fournie', () => {
    expect(create.execute({ year: 2026, elaboratedOn: null }).elaboratedOn).toBe('2026-10-04')
    expect(create.execute({ year: 2026, elaboratedOn: '2026-01-15' }).elaboratedOn).toBe(
      '2026-01-15'
    )
  })

  it('crée un plan vide, sans mise à jour', () => {
    const ppm = create.execute({ year: 2026, elaboratedOn: null })
    expect(ppm).toMatchObject({ lineCount: 0, total: 0, updateCount: 0, lastUpdateOn: null })
    expect(ppm.lines).toEqual([])
  })

  it('refuse une année ou une date invalide, sans rien enregistrer', () => {
    expectDomainError(() => create.execute({ year: 1900, elaboratedOn: null }), 'INVALID_YEAR')
    expectDomainError(
      () => create.execute({ year: 2026, elaboratedOn: '2026-02-30' }),
      'INVALID_DATE'
    )
    expect(region.repositories.ppms.list()).toHaveLength(0)
  })
})

describe('SavePpmLineUseCase', () => {
  it('ajoute une ligne et totalise les montants des services bénéficiaires', () => {
    const { id } = create.execute({ year: 2026, elaboratedOn: null })

    const detail = saveLine.execute(lineInput(id))

    expect(detail.lineCount).toBe(1)
    expect(detail.total).toBe(1_500_000)
    expect(detail.lines[0]).toMatchObject({
      nature: 'TRAVAUX',
      method: 'AOR',
      accounts: ['6012', '6013'],
      total: 1_500_000
    })
  })

  it('modifie une ligne existante sans changer sa position', () => {
    const { id } = create.execute({ year: 2026, elaboratedOn: null })
    saveLine.execute(lineInput(id, { object: 'Ligne A' }))
    const withTwo = saveLine.execute(lineInput(id, { object: 'Ligne B' }))
    const [first, second] = withTwo.lines

    const detail = saveLine.execute(
      lineInput(id, {
        lineId: first?.id ?? '',
        object: 'Ligne A modifiée',
        beneficiaries: [{ service: 'SRH', amount: 100 }]
      })
    )

    expect(detail.lines.map((line) => line.object)).toEqual(['Ligne A modifiée', 'Ligne B'])
    expect(detail.lines.map((line) => line.id)).toEqual([first?.id, second?.id])
    expect(detail.lines[0]?.total).toBe(100)
  })

  it('enregistre vraiment dans la région (relecture)', () => {
    const { id } = create.execute({ year: 2026, elaboratedOn: null })
    saveLine.execute(lineInput(id))
    expect(get.execute({ ppmId: id }).lines).toHaveLength(1)
  })

  it.each([
    ['objet vide', { object: '   ' }, 'REQUIRED_FIELD'],
    ['nature inconnue', { nature: 'AUTRE' }, 'INVALID_VALUE'],
    ['mode inconnu', { method: 'XYZ' }, 'INVALID_VALUE'],
    ['montant négatif', { beneficiaries: [{ service: 'SRH', amount: -5 }] }, 'INVALID_AMOUNT'],
    ['montant décimal', { beneficiaries: [{ service: 'SRH', amount: 1.5 }] }, 'INVALID_AMOUNT'],
    ['service sans nom', { beneficiaries: [{ service: ' ', amount: 5 }] }, 'REQUIRED_FIELD'],
    ['date invalide', { plannedLaunchDate: '2026-13-01' }, 'INVALID_DATE'],
    [
      'dates dans le désordre',
      { plannedLaunchDate: '2026-06-01', plannedBidOpeningDate: '2026-05-01' },
      'INCONSISTENT_PLANNED_DATES'
    ]
  ] as const)('refuse : %s — et ne modifie rien', (_label, overrides, code) => {
    const { id } = create.execute({ year: 2026, elaboratedOn: null })
    expectDomainError(() => saveLine.execute(lineInput(id, overrides)), code)
    expect(get.execute({ ppmId: id }).lines).toHaveLength(0)
  })

  it('refuse un plan ou une ligne inconnus', () => {
    expectDomainError(() => saveLine.execute(lineInput('absent')), 'PPM_NOT_FOUND')
    const { id } = create.execute({ year: 2026, elaboratedOn: null })
    expectDomainError(
      () => saveLine.execute(lineInput(id, { lineId: 'absente' })),
      'LINE_NOT_FOUND'
    )
  })

  it('accepte une ligne minimale (champs optionnels vides)', () => {
    const { id } = create.execute({ year: 2026, elaboratedOn: null })
    const detail = saveLine.execute(
      lineInput(id, {
        financing: null,
        accounts: [],
        plannedLaunchDate: null,
        plannedBidOpeningDate: null,
        plannedAwardDate: null,
        beneficiaries: [],
        method: null,
        procedureLead: null
      })
    )
    expect(detail.lines[0]).toMatchObject({ method: null, total: 0, accounts: [] })
  })
})

describe('RemovePpmLineUseCase', () => {
  const planWithTwoLines = (): { ppmId: string; lineIds: string[] } => {
    const { id } = create.execute({ year: 2026, elaboratedOn: null })
    saveLine.execute(lineInput(id, { object: 'A' }))
    const detail = saveLine.execute(lineInput(id, { object: 'B' }))
    return { ppmId: id, lineIds: detail.lines.map((line) => line.id) }
  }

  it('retire la ligne demandée et conserve les autres', () => {
    const { ppmId, lineIds } = planWithTwoLines()
    const detail = removeLine.execute({ ppmId, lineId: lineIds[0] ?? '' })
    expect(detail.lines.map((line) => line.object)).toEqual(['B'])
  })

  it('refuse une ligne inconnue', () => {
    const { ppmId } = planWithTwoLines()
    expectDomainError(() => removeLine.execute({ ppmId, lineId: 'absente' }), 'LINE_NOT_FOUND')
  })

  it('refuse de retirer une ligne utilisée par une procédure', () => {
    const { ppmId, lineIds } = planWithTwoLines()
    region.repositories.procedures.save(
      createProcedure({
        id: 'p1',
        reference: 'AOR-1',
        object: 'Procédure',
        method: 'AOR',
        ppmLineId: lineIds[0] ?? '',
        createdOn: '2026-10-04'
      })
    )

    expectDomainError(
      () => removeLine.execute({ ppmId, lineId: lineIds[0] ?? '' }),
      'PPM_LINE_IN_USE'
    )
    expect(get.execute({ ppmId }).lines).toHaveLength(2)
    // L'autre ligne, non utilisée, reste supprimable.
    expect(removeLine.execute({ ppmId, lineId: lineIds[1] ?? '' }).lines).toHaveLength(1)
  })

  it('refuse de retirer une ligne utilisée par un contrat', () => {
    const { ppmId, lineIds } = planWithTwoLines()
    region.repositories.contracts.save(
      createContract({
        id: 'k1',
        reference: 'ACH-1',
        kind: 'ACHAT_DIRECT',
        ppmLineId: lineIds[1] ?? '',
        holderId: 'c1',
        object: 'Achat',
        amount: ariary(1000)
      })
    )
    expectDomainError(
      () => removeLine.execute({ ppmId, lineId: lineIds[1] ?? '' }),
      'PPM_LINE_IN_USE'
    )
  })
})

describe('RecordPpmUpdateUseCase', () => {
  it('enregistre la date du jour et incrémente le numéro de mise à jour', () => {
    const { id } = create.execute({ year: 2026, elaboratedOn: '2026-01-10' })

    recordUpdate.execute({ ppmId: id })
    const detail = recordUpdate.execute({ ppmId: id })

    expect(detail).toMatchObject({ updateCount: 2, lastUpdateOn: '2026-10-04' })
  })

  it('refuse un plan inconnu', () => {
    expectDomainError(() => recordUpdate.execute({ ppmId: 'absent' }), 'PPM_NOT_FOUND')
  })
})

describe('DeletePpmUseCase', () => {
  it('supprime le plan avec ses lignes', () => {
    const { id } = create.execute({ year: 2026, elaboratedOn: null })
    saveLine.execute(lineInput(id))

    deletePpm.execute({ ppmId: id })

    expect(list.execute()).toEqual([])
    expectDomainError(() => get.execute({ ppmId: id }), 'PPM_NOT_FOUND')
  })

  it('refuse de supprimer un plan dont une ligne est utilisée', () => {
    const { id } = create.execute({ year: 2026, elaboratedOn: null })
    const detail = saveLine.execute(lineInput(id))
    region.repositories.procedures.save(
      createProcedure({
        id: 'p1',
        reference: 'AOR-1',
        object: 'Procédure',
        method: 'AOR',
        ppmLineId: detail.lines[0]?.id ?? '',
        createdOn: '2026-10-04'
      })
    )

    expectDomainError(() => {
      deletePpm.execute({ ppmId: id })
    }, 'PPM_LINE_IN_USE')
    expect(list.execute()).toHaveLength(1)
  })

  it('refuse un plan inconnu', () => {
    expectDomainError(() => {
      deletePpm.execute({ ppmId: 'absent' })
    }, 'PPM_NOT_FOUND')
  })
})

describe('ListPpmsUseCase', () => {
  it('résume chaque plan (nombre de lignes, total) du plus récent au plus ancien', () => {
    const a = create.execute({ year: 2025, elaboratedOn: null })
    const b = create.execute({ year: 2026, elaboratedOn: null })
    saveLine.execute(lineInput(b.id))

    const summaries = list.execute()

    expect(summaries.map((summary) => summary.id)).toEqual([b.id, a.id])
    expect(summaries[0]).toMatchObject({ lineCount: 1, total: 1_500_000 })
    expect(summaries[1]).toMatchObject({ lineCount: 0, total: 0 })
    expect(summaries[0]).not.toHaveProperty('lines')
  })
})
