import { ipcMain } from 'electron'
import type {
  AddContractEventUseCase,
  CreateContractUseCase,
  DeleteContractUseCase,
  GetContractUseCase,
  ListContractableProceduresUseCase,
  ListContractsUseCase,
  RemoveLastContractEventUseCase,
  UpdateContractUseCase
} from '@application/contracts/contract-use-cases'
import type { ContractableProcedureDto, ContractDetailDto, ContractSummaryDto } from '@shared/api'
import { IpcChannels } from '@shared/ipc-channels'
import {
  addContractEventInputSchema,
  contractIdInputSchema,
  createContractInputSchema,
  updateContractInputSchema
} from '@shared/ipc-schemas'
import { parseInput, runSafely } from './safe-handler'

export interface ContractUseCases {
  readonly listContracts: ListContractsUseCase
  readonly getContract: GetContractUseCase
  readonly createContract: CreateContractUseCase
  readonly updateContract: UpdateContractUseCase
  readonly deleteContract: DeleteContractUseCase
  readonly addContractEvent: AddContractEventUseCase
  readonly removeLastContractEvent: RemoveLastContractEventUseCase
  readonly listContractableProcedures: ListContractableProceduresUseCase
}

/** Contrats et exécution : mêmes garanties que les autres commandes (région ouverte, DTO vérifiés à la compilation). */
export function registerContractHandlers(useCases: ContractUseCases): void {
  ipcMain.handle(IpcChannels.contractList, () =>
    runSafely((): readonly ContractSummaryDto[] => useCases.listContracts.execute())
  )

  ipcMain.handle(IpcChannels.contractableProcedureList, () =>
    runSafely((): readonly ContractableProcedureDto[] =>
      useCases.listContractableProcedures.execute()
    )
  )

  ipcMain.handle(IpcChannels.contractGet, (_event, input: unknown) =>
    runSafely((): ContractDetailDto =>
      useCases.getContract.execute(parseInput(contractIdInputSchema, input))
    )
  )

  ipcMain.handle(IpcChannels.contractCreate, (_event, input: unknown) =>
    runSafely((): ContractDetailDto =>
      useCases.createContract.execute(parseInput(createContractInputSchema, input))
    )
  )

  ipcMain.handle(IpcChannels.contractUpdate, (_event, input: unknown) =>
    runSafely((): ContractDetailDto =>
      useCases.updateContract.execute(parseInput(updateContractInputSchema, input))
    )
  )

  ipcMain.handle(IpcChannels.contractDelete, (_event, input: unknown) =>
    runSafely(() => {
      useCases.deleteContract.execute(parseInput(contractIdInputSchema, input))
      return null
    })
  )

  ipcMain.handle(IpcChannels.contractAddEvent, (_event, input: unknown) =>
    runSafely((): ContractDetailDto =>
      useCases.addContractEvent.execute(parseInput(addContractEventInputSchema, input))
    )
  )

  ipcMain.handle(IpcChannels.contractRemoveLastEvent, (_event, input: unknown) =>
    runSafely((): ContractDetailDto =>
      useCases.removeLastContractEvent.execute(parseInput(contractIdInputSchema, input))
    )
  )
}
