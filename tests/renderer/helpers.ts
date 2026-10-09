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
    getRegionsOverview: vi.fn<PrmpApi['getRegionsOverview']>(),
    createRegion: vi.fn<PrmpApi['createRegion']>(),
    openRegion: vi.fn<PrmpApi['openRegion']>(),
    closeSession: vi.fn<PrmpApi['closeSession']>().mockResolvedValue(ok(null)),
    getSession: vi.fn<PrmpApi['getSession']>().mockResolvedValue(ok({ region: null }))
  }
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true })
  return api
}
