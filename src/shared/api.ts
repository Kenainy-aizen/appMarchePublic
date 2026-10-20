import type { z } from 'zod'
import type {
  addBidInputSchema,
  appInfoSchema,
  candidateIdInputSchema,
  createCandidateInputSchema,
  createPpmInputSchema,
  createProcedureInputSchema,
  createRegionInputSchema,
  openRegionInputSchema,
  saveOrganizationInputSchema,
  ppmIdInputSchema,
  procedureIdInputSchema,
  removeBidInputSchema,
  removePpmLineInputSchema,
  saveStepDatesInputSchema,
  setAwardInputSchema,
  savePpmLineInputSchema,
  stepInputSchema,
  updateBidInputSchema,
  updateCandidateInputSchema,
  updateProcedureInputSchema
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
export type ProcedureIdInputDto = z.infer<typeof procedureIdInputSchema>
export type CreateProcedureInputDto = z.infer<typeof createProcedureInputSchema>
export type UpdateProcedureInputDto = z.infer<typeof updateProcedureInputSchema>
export type SaveStepDatesInputDto = z.infer<typeof saveStepDatesInputSchema>
export type StepInputDto = z.infer<typeof stepInputSchema>
export type CandidateIdInputDto = z.infer<typeof candidateIdInputSchema>
export type CreateCandidateInputDto = z.infer<typeof createCandidateInputSchema>
export type UpdateCandidateInputDto = z.infer<typeof updateCandidateInputSchema>
export type AddBidInputDto = z.infer<typeof addBidInputSchema>
export type UpdateBidInputDto = z.infer<typeof updateBidInputSchema>
export type RemoveBidInputDto = z.infer<typeof removeBidInputSchema>
export type SetAwardInputDto = z.infer<typeof setAwardInputSchema>

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

/** Résumé d'une procédure (liste). */
export interface ProcedureSummaryDto {
  readonly id: string
  readonly reference: string
  readonly object: string
  readonly method: string
  readonly estimatedAmount: number | null
  readonly createdOn: string
  readonly validatedCount: number
  readonly totalSteps: number
  /** NOT_STARTED, IN_PROGRESS ou COMPLETED. */
  readonly status: string
  /** Prochaine étape à valider, ou null si la procédure est terminée. */
  readonly nextStep: string | null
  /** Nom du candidat dont l'offre est retenue, ou null. */
  readonly awardedCandidate: string | null
}

export interface ProcedureStepDto {
  readonly kind: string
  readonly plannedDate: string | null
  readonly actualDate: string | null
  readonly validatedOn: string | null
}

/** Ligne du plan de passation à laquelle une procédure se rattache. */
export interface PpmLineRefDto {
  readonly ppmId: string
  readonly ppmNumber: number
  readonly ppmYear: number
  readonly lineId: string
  readonly object: string
  readonly total: number
}

export interface BidDto {
  readonly id: string
  readonly candidateId: string
  readonly candidateName: string
  readonly amount: number
  readonly awarded: boolean
}

export interface ProcedureDetailDto extends ProcedureSummaryDto {
  readonly ppmLine: PpmLineRefDto | null
  readonly steps: readonly ProcedureStepDto[]
  readonly bids: readonly BidDto[]
  /** Vrai une fois l'attribution validée : les offres ne se modifient plus. */
  readonly bidsLocked: boolean
}

/** Candidat / soumissionnaire. `bidCount` = nombre d'offres déposées (toutes procédures). */
export interface CandidateDto {
  readonly id: string
  readonly name: string
  readonly nif: string | null
  readonly stat: string | null
  readonly address: string | null
  readonly phone: string | null
  readonly email: string | null
  readonly bidCount: number
}

/** Une ligne de plan proposée dans la liste de rattachement d'une procédure. */
export interface PpmLineChoiceDto extends PpmLineRefDto {
  readonly nature: string
  readonly method: string | null
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
  listPpmLines(): Promise<ApiResult<readonly PpmLineChoiceDto[]>>
  listProcedures(): Promise<ApiResult<readonly ProcedureSummaryDto[]>>
  getProcedure(input: ProcedureIdInputDto): Promise<ApiResult<ProcedureDetailDto>>
  createProcedure(input: CreateProcedureInputDto): Promise<ApiResult<ProcedureDetailDto>>
  updateProcedure(input: UpdateProcedureInputDto): Promise<ApiResult<ProcedureDetailDto>>
  saveStepDates(input: SaveStepDatesInputDto): Promise<ApiResult<ProcedureDetailDto>>
  validateStep(input: StepInputDto): Promise<ApiResult<ProcedureDetailDto>>
  reopenStep(input: StepInputDto): Promise<ApiResult<ProcedureDetailDto>>
  deleteProcedure(input: ProcedureIdInputDto): Promise<ApiResult<null>>
  addBid(input: AddBidInputDto): Promise<ApiResult<ProcedureDetailDto>>
  updateBid(input: UpdateBidInputDto): Promise<ApiResult<ProcedureDetailDto>>
  removeBid(input: RemoveBidInputDto): Promise<ApiResult<ProcedureDetailDto>>
  setAward(input: SetAwardInputDto): Promise<ApiResult<ProcedureDetailDto>>
  listCandidates(): Promise<ApiResult<readonly CandidateDto[]>>
  createCandidate(input: CreateCandidateInputDto): Promise<ApiResult<CandidateDto>>
  updateCandidate(input: UpdateCandidateInputDto): Promise<ApiResult<CandidateDto>>
  deleteCandidate(input: CandidateIdInputDto): Promise<ApiResult<null>>
}
