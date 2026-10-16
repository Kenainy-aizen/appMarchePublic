import { beforeEach, describe, expect, it } from 'vitest'
import { CreatePpmUseCase } from '@application/ppm/create-ppm'
import { SavePpmLineUseCase } from '@application/ppm/save-ppm-line'
import {
  CreateProcedureUseCase,
  type ProcedureFields
} from '@application/procedures/create-procedure'
import { DeleteProcedureUseCase } from '@application/procedures/delete-procedure'
import { GetProcedureUseCase } from '@application/procedures/get-procedure'
import { ListPpmLinesUseCase, ListProceduresUseCase } from '@application/procedures/list-procedures'
import {
  ReopenStepUseCase,
  SaveStepDatesUseCase,
  ValidateStepUseCase
} from '@application/procedures/step-use-cases'
import { UpdateProcedureUseCase } from '@application/procedures/update-procedure'
import { RegionSession } from '@application/region-session'
import { createContract } from '@domain/contract'
import { ariary } from '@domain/shared/ariary'
import { DomainError } from '@domain/shared/errors'
import { FakeClock, SequentialIds } from './fakes'
import { type ActiveRegion, openFakeRegion } from './ppm-fakes'

let region: ActiveRegion
let create: CreateProcedureUseCase
let update: UpdateProcedureUseCase
let get: GetProcedureUseCase
let list: ListProceduresUseCase
let saveDates: SaveStepDatesUseCase
let validate: ValidateStepUseCase
let reopen: ReopenStepUseCase
let remove: DeleteProcedureUseCase
let lineId: string

beforeEach(() => {
  region = openFakeRegion()
  const ids = new SequentialIds()
  const clock = new FakeClock() // aujourd'hui = 2026-10-04
  const { session } = region
  create = new CreateProcedureUseCase(session, ids, clock)
  update = new UpdateProcedureUseCase(session)
  get = new GetProcedureUseCase(session)
  list = new ListProceduresUseCase(session)
  saveDates = new SaveStepDatesUseCase(session)
  validate = new ValidateStepUseCase(session, clock)
  reopen = new ReopenStepUseCase(session)
  remove = new DeleteProcedureUseCase(session)

  const plan = new CreatePpmUseCase(session, ids, clock).execute({ year: 2026, elaboratedOn: null })
  const withLine = new SavePpmLineUseCase(session, ids).execute({
    ppmId: plan.id,
    lineId: null,
    nature: 'FOURNITURES',
    object: 'Achat de mobilier',
    financing: null,
    accounts: [],
    plannedLaunchDate: null,
    plannedBidOpeningDate: null,
    plannedAwardDate: null,
    beneficiaries: [
      { service: 'SRH', amount: 1_000_000 },
      { service: 'SAF', amount: 500_000 }
    ],
    method: 'DAO',
    procedureLead: null
  })
  lineId = withLine.lines[0]?.id ?? ''
})

const fields = (overrides: Partial<ProcedureFields> = {}): ProcedureFields => ({
  reference: 'DAO-001/2026',
  object: 'Fourniture de mobilier',
  method: 'DAO',
  ppmLineId: null,
  estimatedAmount: null,
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
    expect(codeOf(() => new ListProceduresUseCase(closed).execute())).toBe('NO_ACTIVE_REGION')
    expect(codeOf(() => new ListPpmLinesUseCase(closed).execute())).toBe('NO_ACTIVE_REGION')
    expect(codeOf(() => new GetProcedureUseCase(closed).execute({ procedureId: 'x' }))).toBe(
      'NO_ACTIVE_REGION'
    )
    expect(
      codeOf(() => new ReopenStepUseCase(closed).execute({ procedureId: 'x', step: 'PUBLICATION' }))
    ).toBe('NO_ACTIVE_REGION')
  })
})

describe('CreateProcedureUseCase', () => {
  it('crée une procédure non démarrée avec ses 5 étapes vides, à la date du jour', () => {
    const procedure = create.execute(fields({ estimatedAmount: 1_500_000 }))

    expect(procedure).toMatchObject({
      reference: 'DAO-001/2026',
      method: 'DAO',
      createdOn: '2026-10-04',
      estimatedAmount: 1_500_000,
      status: 'NOT_STARTED',
      validatedCount: 0,
      totalSteps: 5,
      nextStep: 'PUBLICATION',
      ppmLine: null
    })
    expect(procedure.steps.map((step) => step.kind)).toEqual([
      'PUBLICATION',
      'OUVERTURE_PLIS',
      'EVALUATION',
      'ATTRIBUTION',
      'APPROBATION'
    ])
    expect(
      procedure.steps.every((step) => step.actualDate === null && step.validatedOn === null)
    ).toBe(true)
  })

  it('se rattache à une ligne du plan et en reprend les informations', () => {
    const procedure = create.execute(fields({ ppmLineId: lineId }))
    expect(procedure.ppmLine).toMatchObject({
      ppmNumber: 1,
      ppmYear: 2026,
      lineId,
      object: 'Achat de mobilier',
      total: 1_500_000
    })
  })

  it.each([
    ['référence vide', { reference: '  ' }, 'REQUIRED_FIELD'],
    ['objet vide', { object: '' }, 'REQUIRED_FIELD'],
    ['mode inconnu', { method: 'XYZ' }, 'INVALID_VALUE'],
    ['montant négatif', { estimatedAmount: -1 }, 'INVALID_AMOUNT'],
    ['ligne du plan inconnue', { ppmLineId: 'absente' }, 'PPM_LINE_NOT_FOUND']
  ] as const)('refuse : %s — et n’enregistre rien', (_label, overrides, code) => {
    expect(codeOf(() => create.execute(fields(overrides)))).toBe(code)
    expect(list.execute()).toHaveLength(0)
  })

  it('refuse une référence déjà utilisée, sans tenir compte des majuscules ni des espaces', () => {
    create.execute(fields({ reference: 'DAO-001/2026' }))
    expect(codeOf(() => create.execute(fields({ reference: '  dao-001/2026 ' })))).toBe(
      'DUPLICATE_REFERENCE'
    )
    expect(create.execute(fields({ reference: 'DAO-002/2026' })).reference).toBe('DAO-002/2026')
  })
})

describe('UpdateProcedureUseCase', () => {
  it('modifie l’en-tête', () => {
    const { id } = create.execute(fields())
    const updated = update.execute({
      ...fields({
        reference: 'DAO-009/2026',
        object: 'Mobilier',
        ppmLineId: lineId,
        estimatedAmount: 2_000_000
      }),
      procedureId: id
    })
    expect(updated).toMatchObject({
      reference: 'DAO-009/2026',
      object: 'Mobilier',
      estimatedAmount: 2_000_000
    })
    expect(updated.ppmLine?.lineId).toBe(lineId)
  })

  it('accepte de garder sa propre référence mais pas celle d’une autre procédure', () => {
    const first = create.execute(fields({ reference: 'A-1' }))
    create.execute(fields({ reference: 'B-2' }))

    expect(() =>
      update.execute({ ...fields({ reference: 'A-1', object: 'Nouveau' }), procedureId: first.id })
    ).not.toThrow()
    expect(
      codeOf(() => update.execute({ ...fields({ reference: 'b-2' }), procedureId: first.id }))
    ).toBe('DUPLICATE_REFERENCE')
  })

  it('verrouille le mode dès qu’une étape est validée', () => {
    const { id } = create.execute(fields())
    saveDates.execute({
      procedureId: id,
      step: 'PUBLICATION',
      plannedDate: null,
      actualDate: '2026-10-01'
    })
    validate.execute({ procedureId: id, step: 'PUBLICATION' })

    expect(codeOf(() => update.execute({ ...fields({ method: 'AOR' }), procedureId: id }))).toBe(
      'METHOD_LOCKED'
    )
    expect(get.execute({ procedureId: id }).method).toBe('DAO')
  })

  it('refuse une procédure inconnue', () => {
    expect(codeOf(() => update.execute({ ...fields(), procedureId: 'absente' }))).toBe(
      'PROCEDURE_NOT_FOUND'
    )
  })
})

describe('étapes', () => {
  it('suit tout le déroulement : dates, validations dans l’ordre, procédure terminée', () => {
    const { id } = create.execute(fields())
    const steps = ['PUBLICATION', 'OUVERTURE_PLIS', 'EVALUATION', 'ATTRIBUTION', 'APPROBATION']

    steps.forEach((step, index) => {
      saveDates.execute({
        procedureId: id,
        step,
        plannedDate: null,
        actualDate: `2026-09-${String(10 + index)}`
      })
      const detail = validate.execute({ procedureId: id, step })
      expect(detail.validatedCount).toBe(index + 1)
    })

    expect(get.execute({ procedureId: id })).toMatchObject({
      status: 'COMPLETED',
      nextStep: null,
      validatedCount: 5
    })
    expect(get.execute({ procedureId: id }).steps[0]?.validatedOn).toBe('2026-10-04') // date du jour
  })

  it('refuse de valider une étape avant la précédente, ou sans date réelle, sans rien changer', () => {
    const { id } = create.execute(fields())
    saveDates.execute({
      procedureId: id,
      step: 'OUVERTURE_PLIS',
      plannedDate: null,
      actualDate: '2026-09-10'
    })

    expect(codeOf(() => validate.execute({ procedureId: id, step: 'OUVERTURE_PLIS' }))).toBe(
      'PREVIOUS_STEP_NOT_VALIDATED'
    )
    expect(codeOf(() => validate.execute({ procedureId: id, step: 'PUBLICATION' }))).toBe(
      'ACTUAL_DATE_REQUIRED'
    )
    expect(get.execute({ procedureId: id }).validatedCount).toBe(0)
  })

  it('verrouille les dates d’une étape validée jusqu’à sa réouverture', () => {
    const { id } = create.execute(fields())
    saveDates.execute({
      procedureId: id,
      step: 'PUBLICATION',
      plannedDate: null,
      actualDate: '2026-09-10'
    })
    validate.execute({ procedureId: id, step: 'PUBLICATION' })

    expect(
      codeOf(() =>
        saveDates.execute({
          procedureId: id,
          step: 'PUBLICATION',
          plannedDate: null,
          actualDate: '2026-09-12'
        })
      )
    ).toBe('STEP_LOCKED')

    reopen.execute({ procedureId: id, step: 'PUBLICATION' })
    const corrected = saveDates.execute({
      procedureId: id,
      step: 'PUBLICATION',
      plannedDate: null,
      actualDate: '2026-09-12'
    })
    expect(corrected.steps[0]).toMatchObject({ actualDate: '2026-09-12', validatedOn: null })
  })

  it('refuse de rouvrir une étape dont une suivante est validée', () => {
    const { id } = create.execute(fields())
    for (const [index, step] of ['PUBLICATION', 'OUVERTURE_PLIS'].entries()) {
      saveDates.execute({
        procedureId: id,
        step,
        plannedDate: null,
        actualDate: `2026-09-${String(10 + index)}`
      })
      validate.execute({ procedureId: id, step })
    }
    expect(codeOf(() => reopen.execute({ procedureId: id, step: 'PUBLICATION' }))).toBe(
      'LATER_STEP_VALIDATED'
    )
  })

  it('refuse une étape ou une date invalide', () => {
    const { id } = create.execute(fields())
    expect(codeOf(() => validate.execute({ procedureId: id, step: 'AUTRE' }))).toBe('INVALID_VALUE')
    expect(
      codeOf(() =>
        saveDates.execute({
          procedureId: id,
          step: 'PUBLICATION',
          plannedDate: '2026-13-01',
          actualDate: null
        })
      )
    ).toBe('INVALID_DATE')
  })
})

describe('DeleteProcedureUseCase', () => {
  it('supprime la procédure', () => {
    const { id } = create.execute(fields())
    remove.execute({ procedureId: id })
    expect(list.execute()).toEqual([])
    expect(codeOf(() => get.execute({ procedureId: id }))).toBe('PROCEDURE_NOT_FOUND')
  })

  it('refuse de supprimer une procédure liée à un contrat', () => {
    const { id } = create.execute(fields())
    region.repositories.contracts.save(
      createContract({
        id: 'k1',
        reference: 'M-1',
        kind: 'MARCHE',
        procedureId: id,
        holderId: 'c1',
        object: 'Marché',
        amount: ariary(1000)
      })
    )
    expect(
      codeOf(() => {
        remove.execute({ procedureId: id })
      })
    ).toBe('PROCEDURE_IN_USE')
    expect(list.execute()).toHaveLength(1)
  })

  it('refuse une procédure inconnue', () => {
    expect(
      codeOf(() => {
        remove.execute({ procedureId: 'absente' })
      })
    ).toBe('PROCEDURE_NOT_FOUND')
  })
})

describe('listes', () => {
  it('résume l’avancement de chaque procédure', () => {
    const a = create.execute(fields({ reference: 'A' }))
    create.execute(fields({ reference: 'B' }))
    saveDates.execute({
      procedureId: a.id,
      step: 'PUBLICATION',
      plannedDate: null,
      actualDate: '2026-09-10'
    })
    validate.execute({ procedureId: a.id, step: 'PUBLICATION' })

    const summaries = list.execute()

    expect(summaries.find((summary) => summary.reference === 'A')).toMatchObject({
      status: 'IN_PROGRESS',
      validatedCount: 1,
      nextStep: 'OUVERTURE_PLIS'
    })
    expect(summaries.find((summary) => summary.reference === 'B')).toMatchObject({
      status: 'NOT_STARTED'
    })
    expect(summaries[0]).not.toHaveProperty('steps')
  })

  it('propose les lignes des plans avec leur total, nature et mode', () => {
    expect(new ListPpmLinesUseCase(region.session).execute()).toEqual([
      {
        ppmId: expect.any(String) as string,
        ppmNumber: 1,
        ppmYear: 2026,
        lineId,
        object: 'Achat de mobilier',
        total: 1_500_000,
        nature: 'FOURNITURES',
        method: 'DAO'
      }
    ])
  })
})
