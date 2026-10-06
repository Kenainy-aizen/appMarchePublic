import type { z } from 'zod'
import type { appInfoSchema, createRegionInputSchema, openRegionInputSchema } from './ipc-schemas'

// Types uniquement : aucun code n'est émis dans les bundles preload / renderer.
export type AppInfoDto = z.infer<typeof appInfoSchema>
export type CreateRegionInputDto = z.infer<typeof createRegionInputSchema>
export type OpenRegionInputDto = z.infer<typeof openRegionInputSchema>

/** Une région telle que l'interface la connaît : jamais de clé ni de secret. */
export interface RegionSummaryDto {
  readonly id: string
  readonly name: string
}

export interface RegionsOverviewDto {
  readonly regions: readonly RegionSummaryDto[]
  readonly canCreate: boolean
  readonly suggestedName: string
}

export interface CreateRegionResultDto {
  readonly region: RegionSummaryDto
  /** Affichée une seule fois à l'utilisateur. */
  readonly recoveryKey: string
}

export interface SessionDto {
  readonly region: RegionSummaryDto | null
}

/** Erreur renvoyée à l'interface : `message` est en français et sans détail technique. */
export interface ApiError {
  readonly code: string
  readonly message: string
  readonly retryAfterSeconds?: number
}

/** Toute commande IPC répond par un résultat, jamais par une exception. */
export type ApiResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: ApiError }

/** API exposée à l'interface React via `window.api` (contrat typé). */
export interface PrmpApi {
  getAppInfo(): Promise<AppInfoDto>
  getRegionsOverview(): Promise<ApiResult<RegionsOverviewDto>>
  createRegion(input: CreateRegionInputDto): Promise<ApiResult<CreateRegionResultDto>>
  openRegion(input: OpenRegionInputDto): Promise<ApiResult<RegionSummaryDto>>
  closeSession(): Promise<ApiResult<null>>
  getSession(): Promise<ApiResult<SessionDto>>
}
