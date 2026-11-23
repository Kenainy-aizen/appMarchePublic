import type { z } from 'zod'
import type {
  addAttachmentInputSchema,
  addBidInputSchema,
  addContractEventInputSchema,
  attachmentIdInputSchema,
  attachmentOwnerInputSchema,
  appInfoSchema,
  candidateIdInputSchema,
  contractIdInputSchema,
  createCandidateInputSchema,
  createContractInputSchema,
  createPpmInputSchema,
  createProcedureInputSchema,
  createRegionInputSchema,
  openRegionInputSchema,
  saveAlertHorizonInputSchema,
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
  updateContractInputSchema,
  updateProcedureInputSchema
} from './ipc-schemas'

// Types uniquement : aucun code n'est émis dans les bundles preload / renderer.
export type AppInfoDto = z.infer<typeof appInfoSchema>
export type CreateRegionInputDto = z.infer<typeof createRegionInputSchema>
export type OpenRegionInputDto = z.infer<typeof openRegionInputSchema>
export type SaveOrganizationInputDto = z.infer<typeof saveOrganizationInputSchema>
export type SaveAlertHorizonInputDto = z.infer<typeof saveAlertHorizonInputSchema>
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
export type AttachmentOwnerInputDto = z.infer<typeof attachmentOwnerInputSchema>
export type AddAttachmentInputDto = z.infer<typeof addAttachmentInputSchema>
export type AttachmentIdInputDto = z.infer<typeof attachmentIdInputSchema>
export type ContractIdInputDto = z.infer<typeof contractIdInputSchema>
export type CreateContractInputDto = z.infer<typeof createContractInputSchema>
export type UpdateContractInputDto = z.infer<typeof updateContractInputSchema>
export type AddContractEventInputDto = z.infer<typeof addContractEventInputSchema>

/** Une région telle que l'interface la connaît : jamais de clé ni de secret. */
export interface RegionSummaryDto {
  readonly id: string
  readonly name: string
}

export interface RegionsOverviewDto {
  /** Nom de la PRMP, ou null tant qu'il n'a pas été renseigné. */
  readonly organizationName: string | null
  /** Délai d'alerte des échéances, en jours (7, 15, 30 ou 60). */
  readonly alertHorizonDays: number
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
  /** Marché issu de cette procédure, s'il existe. */
  readonly contract: { readonly id: string; readonly reference: string } | null
  /** Vrai quand l'attribution est validée et qu'aucun marché n'a encore été créé. */
  readonly canCreateContract: boolean
}

/** Document joint (le contenu reste dans le processus principal, chiffré). */
export interface AttachmentDto {
  readonly id: string
  readonly ownerKind: string
  readonly ownerId: string
  readonly name: string
  readonly mimeType: string
  readonly size: number
  readonly addedOn: string
  readonly note: string | null
}

/** Résultat de l'enregistrement d'une copie : `saved` = faux si l'utilisateur a fermé la fenêtre sans choisir. */
export interface ExportResultDto {
  readonly saved: boolean
}

/** Avancement d'un plan de passation. */
export interface PlanProgressDto {
  readonly planId: string
  readonly year: number
  readonly number: number
  readonly lineCount: number
  /** Lignes ayant donné lieu à au moins une procédure ou un contrat. */
  readonly launchedLineCount: number
  /** Part des lignes lancées, de 0 à 100. */
  readonly launchRatePercent: number
  readonly plannedAmount: number
  /** Montant actuel (avenants compris) des contrats rattachés aux lignes de ce plan. */
  readonly contractedAmount: number
}

export interface MethodFiguresDto {
  readonly method: string
  readonly count: number
  readonly estimatedAmount: number
}

/** Indicateurs de la région, recalculés à chaque appel (jamais enregistrés). */
export interface DashboardDto {
  readonly plans: readonly PlanProgressDto[]
  readonly procedures: {
    readonly total: number
    readonly notStarted: number
    readonly inProgress: number
    readonly completed: number
    readonly awarded: number
    readonly byMethod: readonly MethodFiguresDto[]
  }
  readonly contracts: {
    readonly total: number
    /** Nombre de contrats par situation (NOT_STARTED, IN_PROGRESS, STOPPED, PROVISIONALLY_RECEIVED, FINALLY_RECEIVED, CLOSED). */
    readonly byStatus: Readonly<Record<string, number>>
    readonly initialAmount: number
    readonly amendmentsAmount: number
    readonly currentAmount: number
  }
  readonly candidates: {
    readonly total: number
    readonly bids: number
    readonly awardedBids: number
  }
}

/** Une échéance à surveiller. Les alertes sont recalculées à chaque appel, jamais enregistrées. */
export interface AlertDto {
  readonly key: string
  /** PROCEDURE_STEP, PPM_LINE_LAUNCH ou CONTRACT_NOT_STARTED. */
  readonly kind: string
  /** OVERDUE (échéance dépassée) ou UPCOMING (dans le délai d'alerte). */
  readonly severity: string
  readonly dueOn: string
  /** Négatif quand l'échéance est dépassée ; 0 le jour même. */
  readonly daysLeft: number
  readonly subject: string
  readonly action: string
  /** PROCEDURE, PPM ou CONTRACT : l'élément à ouvrir. */
  readonly target: { readonly kind: string; readonly id: string }
}

export interface AlertsDto {
  readonly today: string
  readonly horizonDays: number
  readonly overdueCount: number
  readonly upcomingCount: number
  readonly items: readonly AlertDto[]
}

export interface AlertHorizonDto {
  readonly alertHorizonDays: number
}

/** Résumé d'un contrat (liste). Montants en Ariary entiers. */
export interface ContractSummaryDto {
  readonly id: string
  readonly reference: string
  readonly kind: string
  readonly object: string
  readonly holderName: string
  readonly amount: number
  /** Montant initial + avenants. */
  readonly currentAmount: number
  readonly signedOn: string | null
  readonly status: string
}

export interface ContractEventDto {
  readonly id: string
  readonly kind: string
  readonly occurredOn: string
  readonly amountDelta: number | null
  readonly note: string | null
}

export interface ContractDetailDto extends ContractSummaryDto {
  readonly holderId: string
  readonly procedure: { readonly id: string; readonly reference: string } | null
  readonly ppmLine: PpmLineRefDto | null
  readonly events: readonly ContractEventDto[]
  /** Événements enregistrables à l'étape actuelle (vide tant que la date de signature manque). */
  readonly allowedEvents: readonly string[]
  /** Vrai dès le premier événement : montant initial et date de signature figés. */
  readonly headerLocked: boolean
}

/** Procédure attribuée, sans marché : proposée à la création d'un marché. */
export interface ContractableProcedureDto {
  readonly id: string
  readonly reference: string
  readonly object: string
  readonly holderId: string
  readonly holderName: string
  /** Montant de l'offre retenue. */
  readonly amount: number
  readonly ppmLineId: string | null
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
  listContracts(): Promise<ApiResult<readonly ContractSummaryDto[]>>
  getContract(input: ContractIdInputDto): Promise<ApiResult<ContractDetailDto>>
  createContract(input: CreateContractInputDto): Promise<ApiResult<ContractDetailDto>>
  updateContract(input: UpdateContractInputDto): Promise<ApiResult<ContractDetailDto>>
  deleteContract(input: ContractIdInputDto): Promise<ApiResult<null>>
  addContractEvent(input: AddContractEventInputDto): Promise<ApiResult<ContractDetailDto>>
  removeLastContractEvent(input: ContractIdInputDto): Promise<ApiResult<ContractDetailDto>>
  listContractableProcedures(): Promise<ApiResult<readonly ContractableProcedureDto[]>>
  getDashboard(): Promise<ApiResult<DashboardDto>>
  listAlerts(): Promise<ApiResult<AlertsDto>>
  saveAlertHorizon(input: SaveAlertHorizonInputDto): Promise<ApiResult<AlertHorizonDto>>
  listAttachments(input: AttachmentOwnerInputDto): Promise<ApiResult<readonly AttachmentDto[]>>
  addAttachment(input: AddAttachmentInputDto): Promise<ApiResult<AttachmentDto>>
  removeAttachment(input: AttachmentIdInputDto): Promise<ApiResult<null>>
  exportAttachment(input: AttachmentIdInputDto): Promise<ApiResult<ExportResultDto>>
}
