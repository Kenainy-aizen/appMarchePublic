import { ipcMain } from 'electron'
import type { CreatePpmUseCase } from '@application/ppm/create-ppm'
import type { DeletePpmUseCase } from '@application/ppm/delete-ppm'
import type { GetPpmUseCase } from '@application/ppm/get-ppm'
import type { ListPpmsUseCase } from '@application/ppm/list-ppms'
import type { RecordPpmUpdateUseCase } from '@application/ppm/record-ppm-update'
import type { RemovePpmLineUseCase } from '@application/ppm/remove-ppm-line'
import type { SavePpmLineUseCase } from '@application/ppm/save-ppm-line'
import type { PpmDetailDto, PpmSummaryDto } from '@shared/api'
import { IpcChannels } from '@shared/ipc-channels'
import {
  createPpmInputSchema,
  ppmIdInputSchema,
  removePpmLineInputSchema,
  savePpmLineInputSchema
} from '@shared/ipc-schemas'
import { parseInput, runSafely } from './safe-handler'

export interface PpmUseCases {
  readonly listPpms: ListPpmsUseCase
  readonly getPpm: GetPpmUseCase
  readonly createPpm: CreatePpmUseCase
  readonly savePpmLine: SavePpmLineUseCase
  readonly removePpmLine: RemovePpmLineUseCase
  readonly recordPpmUpdate: RecordPpmUpdateUseCase
  readonly deletePpm: DeletePpmUseCase
}

/**
 * Commandes du plan de passation. Elles n'agissent que sur la région ouverte (`RegionSession`) : sans région
 * ouverte, chaque commande répond `NO_ACTIVE_REGION`. Les annotations de type des retours garantissent à la
 * compilation que ce que l'on envoie correspond aux DTO que l'interface attend.
 */
export function registerPpmHandlers(useCases: PpmUseCases): void {
  ipcMain.handle(IpcChannels.ppmList, () =>
    runSafely((): readonly PpmSummaryDto[] => useCases.listPpms.execute())
  )

  ipcMain.handle(IpcChannels.ppmGet, (_event, input: unknown) =>
    runSafely((): PpmDetailDto => useCases.getPpm.execute(parseInput(ppmIdInputSchema, input)))
  )

  ipcMain.handle(IpcChannels.ppmCreate, (_event, input: unknown) =>
    runSafely((): PpmDetailDto =>
      useCases.createPpm.execute(parseInput(createPpmInputSchema, input))
    )
  )

  ipcMain.handle(IpcChannels.ppmSaveLine, (_event, input: unknown) =>
    runSafely((): PpmDetailDto =>
      useCases.savePpmLine.execute(parseInput(savePpmLineInputSchema, input))
    )
  )

  ipcMain.handle(IpcChannels.ppmRemoveLine, (_event, input: unknown) =>
    runSafely((): PpmDetailDto =>
      useCases.removePpmLine.execute(parseInput(removePpmLineInputSchema, input))
    )
  )

  ipcMain.handle(IpcChannels.ppmRecordUpdate, (_event, input: unknown) =>
    runSafely((): PpmDetailDto =>
      useCases.recordPpmUpdate.execute(parseInput(ppmIdInputSchema, input))
    )
  )

  ipcMain.handle(IpcChannels.ppmDelete, (_event, input: unknown) =>
    runSafely(() => {
      useCases.deletePpm.execute(parseInput(ppmIdInputSchema, input))
      return null
    })
  )
}
