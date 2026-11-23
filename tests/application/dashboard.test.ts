import { beforeEach, describe, expect, it } from 'vitest'
import { CreateCandidateUseCase } from '@application/candidates/candidate-use-cases'
import {
  CreateContractUseCase,
  AddContractEventUseCase
} from '@application/contracts/contract-use-cases'
import { GetDashboardUseCase } from '@application/dashboard/get-dashboard'
import { CreatePpmUseCase } from '@application/ppm/create-ppm'
import { SavePpmLineUseCase } from '@application/ppm/save-ppm-line'
import { AddBidUseCase } from '@application/procedures/bid-use-cases'
import { CreateProcedureUseCase } from '@application/procedures/create-procedure'
import { SaveStepDatesUseCase, ValidateStepUseCase } from '@application/procedures/step-use-cases'
import { RegionSession } from '@application/region-session'
import { DomainError } from '@domain/shared/errors'
import { FakeClock, SequentialIds } from './fakes'
import { type ActiveRegion, openFakeRegion } from './ppm-fakes'

let region: ActiveRegion
let dashboard: GetDashboardUseCase
let ids: SequentialIds

beforeEach(() => {
  region = openFakeRegion()
  ids = new SequentialIds()
  dashboard = new GetDashboardUseCase(region.session)
})

describe('GetDashboardUseCase', () => {
  it('exige une région ouverte', () => {
    let code = ''
    try {
      new GetDashboardUseCase(new RegionSession()).execute()
    } catch (error) {
      code = error instanceof DomainError ? error.code : 'AUTRE'
    }
    expect(code).toBe('NO_ACTIVE_REGION')
  })

  it('n’affiche que des zéros pour une région vide', () => {
    const result = dashboard.execute()
    expect(result.plans).toEqual([])
    expect(result.procedures).toMatchObject({ total: 0, byMethod: [] })
    expect(result.contracts).toMatchObject({ total: 0, currentAmount: 0 })
    expect(result.candidates).toEqual({ total: 0, bids: 0, awardedBids: 0 })
  })

  it('reflète immédiatement les données de la région, sans rien stocker', () => {
    const clock = new FakeClock()
    const { session } = region
    const plan = new CreatePpmUseCase(session, ids, clock).execute({
      year: 2026,
      elaboratedOn: null
    })
    const withLines = new SavePpmLineUseCase(session, ids).execute({
      ppmId: plan.id,
      lineId: null,
      nature: 'FOURNITURES',
      object: 'Mobilier',
      financing: null,
      accounts: [],
      plannedLaunchDate: null,
      plannedBidOpeningDate: null,
      plannedAwardDate: null,
      beneficiaries: [{ service: 'SRH', amount: 1_000_000 }],
      method: 'DAO',
      procedureLead: null
    })
    const lineId = withLines.lines[0]?.id ?? ''
    expect(dashboard.execute().plans[0]).toMatchObject({
      lineCount: 1,
      launchedLineCount: 0,
      plannedAmount: 1_000_000
    })

    const procedureId = new CreateProcedureUseCase(session, ids, clock).execute({
      reference: 'DAO-001/2026',
      object: 'Mobilier',
      method: 'DAO',
      ppmLineId: lineId,
      estimatedAmount: 900_000
    }).id
    const afterProcedure = dashboard.execute()
    expect(afterProcedure.plans[0]?.launchedLineCount).toBe(1)
    expect(afterProcedure.procedures).toMatchObject({
      total: 1,
      notStarted: 1,
      inProgress: 0,
      byMethod: [{ method: 'DAO', count: 1, estimatedAmount: 900_000 }]
    })

    new SaveStepDatesUseCase(session).execute({
      procedureId,
      step: 'PUBLICATION',
      plannedDate: null,
      actualDate: '2026-02-01'
    })
    new ValidateStepUseCase(session, clock).execute({ procedureId, step: 'PUBLICATION' })
    expect(dashboard.execute().procedures).toMatchObject({ notStarted: 0, inProgress: 1 })
  })

  it('totalise candidats, offres et contrats, avenants compris', () => {
    const { session } = region
    const holder = new CreateCandidateUseCase(session, ids).execute({
      name: 'SARL Alpha',
      nif: null,
      stat: null,
      address: null,
      phone: null,
      email: null
    })
    const procedureId = new CreateProcedureUseCase(session, ids, new FakeClock()).execute({
      reference: 'DAO-001/2026',
      object: 'Objet',
      method: 'DAO',
      ppmLineId: null,
      estimatedAmount: null
    }).id
    new AddBidUseCase(session, ids).execute({
      procedureId,
      candidateId: holder.id,
      amount: 500_000
    })
    const contract = new CreateContractUseCase(session, ids).execute({
      kind: 'ACHAT_DIRECT',
      procedureId: null,
      reference: 'A-1',
      object: 'Achat',
      holderId: holder.id,
      ppmLineId: null,
      amount: 800_000,
      signedOn: '2026-03-01'
    })
    new AddContractEventUseCase(session, ids).execute({
      contractId: contract.id,
      kind: 'AVENANT',
      occurredOn: '2026-04-01',
      amountDelta: 200_000,
      note: null
    })

    const result = dashboard.execute()

    expect(result.candidates).toEqual({ total: 1, bids: 1, awardedBids: 0 })
    expect(result.contracts).toMatchObject({
      total: 1,
      initialAmount: 800_000,
      amendmentsAmount: 200_000,
      currentAmount: 1_000_000
    })
    expect(result.contracts.byStatus.NOT_STARTED).toBe(1)
  })
})
