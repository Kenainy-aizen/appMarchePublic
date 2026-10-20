import { ipcMain } from 'electron'
import type {
  CreateCandidateUseCase,
  DeleteCandidateUseCase,
  ListCandidatesUseCase,
  UpdateCandidateUseCase
} from '@application/candidates/candidate-use-cases'
import type {
  AddBidUseCase,
  RemoveBidUseCase,
  SetAwardUseCase,
  UpdateBidUseCase
} from '@application/procedures/bid-use-cases'
import type { CandidateDto, ProcedureDetailDto } from '@shared/api'
import { IpcChannels } from '@shared/ipc-channels'
import {
  addBidInputSchema,
  candidateIdInputSchema,
  createCandidateInputSchema,
  removeBidInputSchema,
  setAwardInputSchema,
  updateBidInputSchema,
  updateCandidateInputSchema
} from '@shared/ipc-schemas'
import { parseInput, runSafely } from './safe-handler'

export interface CandidateUseCases {
  readonly listCandidates: ListCandidatesUseCase
  readonly createCandidate: CreateCandidateUseCase
  readonly updateCandidate: UpdateCandidateUseCase
  readonly deleteCandidate: DeleteCandidateUseCase
  readonly addBid: AddBidUseCase
  readonly updateBid: UpdateBidUseCase
  readonly removeBid: RemoveBidUseCase
  readonly setAward: SetAwardUseCase
}

/** Candidats et offres : mêmes garanties que les autres commandes (région ouverte, DTO vérifiés à la compilation). */
export function registerCandidateHandlers(useCases: CandidateUseCases): void {
  ipcMain.handle(IpcChannels.candidateList, () =>
    runSafely((): readonly CandidateDto[] => useCases.listCandidates.execute())
  )

  ipcMain.handle(IpcChannels.candidateCreate, (_event, input: unknown) =>
    runSafely((): CandidateDto =>
      useCases.createCandidate.execute(parseInput(createCandidateInputSchema, input))
    )
  )

  ipcMain.handle(IpcChannels.candidateUpdate, (_event, input: unknown) =>
    runSafely((): CandidateDto =>
      useCases.updateCandidate.execute(parseInput(updateCandidateInputSchema, input))
    )
  )

  ipcMain.handle(IpcChannels.candidateDelete, (_event, input: unknown) =>
    runSafely(() => {
      useCases.deleteCandidate.execute(parseInput(candidateIdInputSchema, input))
      return null
    })
  )

  ipcMain.handle(IpcChannels.procedureAddBid, (_event, input: unknown) =>
    runSafely((): ProcedureDetailDto =>
      useCases.addBid.execute(parseInput(addBidInputSchema, input))
    )
  )

  ipcMain.handle(IpcChannels.procedureUpdateBid, (_event, input: unknown) =>
    runSafely((): ProcedureDetailDto =>
      useCases.updateBid.execute(parseInput(updateBidInputSchema, input))
    )
  )

  ipcMain.handle(IpcChannels.procedureRemoveBid, (_event, input: unknown) =>
    runSafely((): ProcedureDetailDto =>
      useCases.removeBid.execute(parseInput(removeBidInputSchema, input))
    )
  )

  ipcMain.handle(IpcChannels.procedureSetAward, (_event, input: unknown) =>
    runSafely((): ProcedureDetailDto =>
      useCases.setAward.execute(parseInput(setAwardInputSchema, input))
    )
  )
}
