import type { z } from 'zod'
import type {
  appInfoSchema,
  createPpmInputSchema,
  createRegionInputSchema,
  openRegionInputSchema,
  saveOrganizationInputSchema,
  ppmIdInputSchema,
  removePpmLineInputSchema,
  savePpmLineInputSchema
} from './ipc-schemas'

// Types uniquement : aucun code n'est émis dans les bundles preload / renderer.
export type AppInfoDto = z.infer<typeof appInfoSchema>
export type CreateRegionInputDto = z.infer<typeof createRegionInputSchema>
export type OpenRegionInputDto = z.infer<typeof openRegionInputSchema>
export type SaveOrganizationInputDto = z.infer<typeof saveOrganizationInputSchema>
export type PpmIdInputDto = z.infer<typeof ppmIdInputSchema>
export type CreatePpmInputDto = z.infer<typeof createPpmInputSchema>
export type SavePpmLineInputDto = z.infer<typeof savePpmLineInputSchema>
export type RemovePpmLineInputDto = z.infer<typeof removePpmLineInputSchema>

/** Une région telle que l'interface la connaît : jamais de clé ni de secret. */
export interface RegionSummaryDto {
  readonly id: string
  readonly name: string
}

export interface RegionsOverviewDto {
  /** Nom de la PRMP, ou null tant qu'il n'a pas été renseigné. */
  readonly organizationName: string | null
  readonly regions: readonly RegionSummaryDto[]
  readonly canCreate: boolean
  readonly suggestedName: string
}

export interface OrganizationDto {
  readonly name: string
}

export interface CreateRegionResultDto {
  readonly region: RegionSummaryDto
  /** Affichée une seule fois à l'utilisateur. */
  readonly recoveryKey: string
}

export interface SessionDto {
  readonly region: RegionSummaryDto | null
}

/** Résumé d'un plan de passation (liste). Montants en Ariary entiers, dates au format AAAA-MM-JJ. */
export interface PpmSummaryDto {
  readonly id: string
  readonly year: number
  readonly number: number
  readonly elaboratedOn: string
  readonly lastUpdateOn: string | null
  readonly updateCount: number
  readonly lineCount: number
  readonly total: number
}

export interface BeneficiaryDto {
  readonly service: string
  readonly amount: number
}

export interface PpmLineDto {
  readonly id: string
  readonly nature: string
  readonly object: string
  readonly financing: string | null
  readonly accounts: readonly string[]
  readonly plannedLaunchDate: string | null
  readonly plannedBidOpeningDate: string | null
  readonly plannedAwardDate: string | null
  readonly beneficiaries: readonly BeneficiaryDto[]
  readonly method: string | null
  readonly procedureLead: string | null
  /** Somme des montants des services bénéficiaires. */
  readonly total: number
}

export interface PpmDetailDto extends PpmSummaryDto {
  readonly lines: readonly PpmLineDto[]
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
  saveOrganization(input: SaveOrganizationInputDto): Promise<ApiResult<OrganizationDto>>
  closeSession(): Promise<ApiResult<null>>
  getSession(): Promise<ApiResult<SessionDto>>
  listPpms(): Promise<ApiResult<readonly PpmSummaryDto[]>>
  getPpm(input: PpmIdInputDto): Promise<ApiResult<PpmDetailDto>>
  createPpm(input: CreatePpmInputDto): Promise<ApiResult<PpmDetailDto>>
  savePpmLine(input: SavePpmLineInputDto): Promise<ApiResult<PpmDetailDto>>
  removePpmLine(input: RemovePpmLineInputDto): Promise<ApiResult<PpmDetailDto>>
  recordPpmUpdate(input: PpmIdInputDto): Promise<ApiResult<PpmDetailDto>>
  deletePpm(input: PpmIdInputDto): Promise<ApiResult<null>>
}
