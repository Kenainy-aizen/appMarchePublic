import { vi, type Mock } from 'vitest'
import type { ApiResult, PrmpApi } from '@shared/api'

export const ok = <T>(value: T): ApiResult<T> => ({ ok: true, value })

export const fail = (code: string, message: string): ApiResult<never> => ({
  ok: false,
  error: { code, message }
})

export type ApiMock = { readonly [K in keyof PrmpApi]: Mock<PrmpApi[K]> }

/** Installe un faux `window.api` (le vrai est fourni par le preload d'Electron). */
export function installApiMock(): ApiMock {
  const api: ApiMock = {
    getAppInfo: vi
      .fn<PrmpApi['getAppInfo']>()
      .mockResolvedValue({ name: 'Suivi des marchés publics', version: '0.1.0' }),
    getRegionsOverview: vi
      .fn<PrmpApi['getRegionsOverview']>()
      .mockResolvedValue(
        ok({ organizationName: null, regions: [], canCreate: true, suggestedName: 'Région 1' })
      ),
    saveOrganization: vi
      .fn<PrmpApi['saveOrganization']>()
      .mockResolvedValue(ok({ name: 'PRMP de test' })),
    createRegion: vi.fn<PrmpApi['createRegion']>(),
    openRegion: vi.fn<PrmpApi['openRegion']>(),
    closeSession: vi.fn<PrmpApi['closeSession']>().mockResolvedValue(ok(null)),
    getSession: vi.fn<PrmpApi['getSession']>().mockResolvedValue(ok({ region: null })),
    listPpms: vi.fn<PrmpApi['listPpms']>().mockResolvedValue(ok([])),
    getPpm: vi.fn<PrmpApi['getPpm']>(),
    createPpm: vi.fn<PrmpApi['createPpm']>(),
    savePpmLine: vi.fn<PrmpApi['savePpmLine']>(),
    removePpmLine: vi.fn<PrmpApi['removePpmLine']>(),
    recordPpmUpdate: vi.fn<PrmpApi['recordPpmUpdate']>(),
    deletePpm: vi.fn<PrmpApi['deletePpm']>().mockResolvedValue(ok(null)),
    listPpmLines: vi.fn<PrmpApi['listPpmLines']>().mockResolvedValue(ok([])),
    listProcedures: vi.fn<PrmpApi['listProcedures']>().mockResolvedValue(ok([])),
    getProcedure: vi.fn<PrmpApi['getProcedure']>(),
    createProcedure: vi.fn<PrmpApi['createProcedure']>(),
    updateProcedure: vi.fn<PrmpApi['updateProcedure']>(),
    saveStepDates: vi.fn<PrmpApi['saveStepDates']>(),
    validateStep: vi.fn<PrmpApi['validateStep']>(),
    reopenStep: vi.fn<PrmpApi['reopenStep']>(),
    deleteProcedure: vi.fn<PrmpApi['deleteProcedure']>().mockResolvedValue(ok(null)),
    addBid: vi.fn<PrmpApi['addBid']>(),
    updateBid: vi.fn<PrmpApi['updateBid']>(),
    removeBid: vi.fn<PrmpApi['removeBid']>(),
    setAward: vi.fn<PrmpApi['setAward']>(),
    listCandidates: vi.fn<PrmpApi['listCandidates']>().mockResolvedValue(ok([])),
    createCandidate: vi.fn<PrmpApi['createCandidate']>(),
    updateCandidate: vi.fn<PrmpApi['updateCandidate']>(),
    deleteCandidate: vi.fn<PrmpApi['deleteCandidate']>().mockResolvedValue(ok(null))
  }
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true })
  return api
}
