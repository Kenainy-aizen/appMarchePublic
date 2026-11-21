import { beforeEach, describe, expect, it } from 'vitest'
import { ListAlertsUseCase, SaveAlertHorizonUseCase } from '@application/alerts/alert-use-cases'
import { CreateContractUseCase } from '@application/contracts/contract-use-cases'
import { CreateCandidateUseCase } from '@application/candidates/candidate-use-cases'
import { CreateProcedureUseCase } from '@application/procedures/create-procedure'
import { SaveStepDatesUseCase } from '@application/procedures/step-use-cases'
import { RegionSession } from '@application/region-session'
import { DomainError } from '@domain/shared/errors'
import { FakeClock, InMemoryOrganizationSettings, SequentialIds } from './fakes'
import { type ActiveRegion, openFakeRegion } from './ppm-fakes'

// FakeClock : aujourd'hui = 2026-10-04
let region: ActiveRegion
let settings: InMemoryOrganizationSettings
let list: ListAlertsUseCase
let saveHorizon: SaveAlertHorizonUseCase
let ids: SequentialIds
let procedureId: string

beforeEach(() => {
  region = openFakeRegion()
  settings = new InMemoryOrganizationSettings()
  ids = new SequentialIds()
  list = new ListAlertsUseCase(region.session, settings, new FakeClock())
  saveHorizon = new SaveAlertHorizonUseCase(settings)
  procedureId = new CreateProcedureUseCase(region.session, ids, new FakeClock()).execute({
    reference: 'DAO-001/2026',
    object: 'Fourniture de mobilier',
    method: 'DAO',
    ppmLineId: null,
    estimatedAmount: null
  }).id
})

const plan = (step: 'PUBLICATION' | 'OUVERTURE_PLIS', plannedDate: string | null): void => {
  new SaveStepDatesUseCase(region.session).execute({
    procedureId,
    step,
    plannedDate,
    actualDate: null
  })
}

const codeOf = (action: () => unknown): string => {
  try {
    action()
  } catch (error) {
    if (error instanceof DomainError) return error.code
    throw error
  }
  return 'AUCUNE_ERREUR'
}

describe('ListAlertsUseCase', () => {
  it('exige une région ouverte', () => {
    const closed = new ListAlertsUseCase(new RegionSession(), settings, new FakeClock())
    expect(codeOf(() => closed.execute())).toBe('NO_ACTIVE_REGION')
  })

  it('n’a aucune alerte quand rien n’est planifié', () => {
    expect(list.execute()).toEqual({
      today: '2026-10-04',
      horizonDays: 15,
      overdueCount: 0,
      upcomingCount: 0,
      items: []
    })
  })

  it('signale en retard et à venir, avec les compteurs et le lien vers la procédure', () => {
    plan('PUBLICATION', '2026-09-29') // retard de 5 jours
    plan('OUVERTURE_PLIS', '2026-10-09') // dans 5 jours

    const alerts = list.execute()

    expect(alerts).toMatchObject({ overdueCount: 1, upcomingCount: 1 })
    expect(alerts.items.map((a) => [a.severity, a.daysLeft, a.subject, a.action])).toEqual([
      ['OVERDUE', -5, 'DAO-001/2026', 'Publication de l’avis'],
      ['UPCOMING', 5, 'DAO-001/2026', 'Ouverture des plis']
    ])
    expect(alerts.items[0]?.target).toEqual({ kind: 'PROCEDURE', id: procedureId })
  })

  it('suit le délai d’alerte choisi', () => {
    plan('OUVERTURE_PLIS', '2026-10-30') // dans 26 jours
    expect(list.execute().items).toEqual([])

    saveHorizon.execute({ days: 30 })

    const alerts = list.execute()
    expect(alerts.horizonDays).toBe(30)
    expect(alerts.upcomingCount).toBe(1)
  })

  it('une alerte disparaît dès que son échéance est traitée ou replanifiée (rien n’est stocké)', () => {
    plan('PUBLICATION', '2026-09-29')
    expect(list.execute().overdueCount).toBe(1)

    plan('PUBLICATION', '2027-01-01') // replanifiée au-delà de l'horizon
    expect(list.execute().items).toEqual([])
  })

  it('un achat direct signé depuis longtemps ne produit aucune alerte (seul un marché attribué est suivi)', () => {
    const holder = new CreateCandidateUseCase(region.session, ids).execute({
      name: 'SARL Alpha',
      nif: null,
      stat: null,
      address: null,
      phone: null,
      email: null
    })
    new CreateContractUseCase(region.session, ids).execute({
      kind: 'ACHAT_DIRECT',
      procedureId: null,
      reference: 'A-1',
      object: 'Achat',
      holderId: holder.id,
      ppmLineId: null,
      amount: 1000,
      signedOn: '2026-01-01'
    })

    expect(list.execute().items).toEqual([])
  })
})

describe('SaveAlertHorizonUseCase', () => {
  it.each([7, 15, 30, 60])('accepte %i jours', (days) => {
    expect(saveHorizon.execute({ days })).toEqual({ alertHorizonDays: days })
    expect(settings.getAlertHorizonDays()).toBe(days)
  })

  it.each([0, 10, 45, -15, 7.5])('refuse %s sans rien enregistrer', (days) => {
    expect(codeOf(() => saveHorizon.execute({ days }))).toBe('INVALID_VALUE')
    expect(settings.getAlertHorizonDays()).toBe(15)
  })
})
