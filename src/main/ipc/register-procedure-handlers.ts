import { ipcMain } from 'electron'
import type { CreateProcedureUseCase } from '@application/procedures/create-procedure'
import type { DeleteProcedureUseCase } from '@application/procedures/delete-procedure'
import type { GetProcedureUseCase } from '@application/procedures/get-procedure'
import type {
  ListPpmLinesUseCase,
  ListProceduresUseCase
} from '@application/procedures/list-procedures'
import type {
  ReopenStepUseCase,
  SaveStepDatesUseCase,
  ValidateStepUseCase
} from '@application/procedures/step-use-cases'
import type { UpdateProcedureUseCase } from '@application/procedures/update-procedure'
import type { PpmLineChoiceDto, ProcedureDetailDto, ProcedureSummaryDto } from '@shared/api'
import { IpcChannels } from '@shared/ipc-channels'
import {
  createProcedureInputSchema,
  procedureIdInputSchema,
  saveStepDatesInputSchema,
  stepInputSchema,
  updateProcedureInputSchema
} from '@shared/ipc-schemas'
import { parseInput, runSafely } from './safe-handler'

export interface ProcedureUseCases {
  readonly listProcedures: ListProceduresUseCase
  readonly listPpmLines: ListPpmLinesUseCase
  readonly getProcedure: GetProcedureUseCase
  readonly createProcedure: CreateProcedureUseCase
  readonly updateProcedure: UpdateProcedureUseCase
  readonly saveStepDates: SaveStepDatesUseCase
  readonly validateStep: ValidateStepUseCase
  readonly reopenStep: ReopenStepUseCase
  readonly deleteProcedure: DeleteProcedureUseCase
}

/**
 * Commandes des procédures de passation. Elles n'agissent que sur la région ouverte ; les annotations de
 * type des retours garantissent à la compilation la compatibilité avec les DTO attendus par l'interface.
 */
export function registerProcedureHandlers(useCases: ProcedureUseCases): void {
  ipcMain.handle(IpcChannels.ppmLineList, () =>
    runSafely((): readonly PpmLineChoiceDto[] => useCases.listPpmLines.execute())
  )

  ipcMain.handle(IpcChannels.procedureList, () =>
    runSafely((): readonly ProcedureSummaryDto[] => useCases.listProcedures.execute())
  )

  ipcMain.handle(IpcChannels.procedureGet, (_event, input: unknown) =>
    runSafely((): ProcedureDetailDto =>
      useCases.getProcedure.execute(parseInput(procedureIdInputSchema, input))
    )
  )

  ipcMain.handle(IpcChannels.procedureCreate, (_event, input: unknown) =>
    runSafely((): ProcedureDetailDto =>
      useCases.createProcedure.execute(parseInput(createProcedureInputSchema, input))
    )
  )

  ipcMain.handle(IpcChannels.procedureUpdate, (_event, input: unknown) =>
    runSafely((): ProcedureDetailDto =>
      useCases.updateProcedure.execute(parseInput(updateProcedureInputSchema, input))
    )
  )

  ipcMain.handle(IpcChannels.procedureSaveStepDates, (_event, input: unknown) =>
    runSafely((): ProcedureDetailDto =>
      useCases.saveStepDates.execute(parseInput(saveStepDatesInputSchema, input))
    )
  )

  ipcMain.handle(IpcChannels.procedureValidateStep, (_event, input: unknown) =>
    runSafely((): ProcedureDetailDto =>
      useCases.validateStep.execute(parseInput(stepInputSchema, input))
    )
  )

  ipcMain.handle(IpcChannels.procedureReopenStep, (_event, input: unknown) =>
    runSafely((): ProcedureDetailDto =>
      useCases.reopenStep.execute(parseInput(stepInputSchema, input))
    )
  )

  ipcMain.handle(IpcChannels.procedureDelete, (_event, input: unknown) =>
    runSafely(() => {
      useCases.deleteProcedure.execute(parseInput(procedureIdInputSchema, input))
      return null
    })
  )
}
