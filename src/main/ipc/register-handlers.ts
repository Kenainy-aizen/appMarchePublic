import { ipcMain } from 'electron'
import type { GetAppInfoUseCase } from '@application/get-app-info'
import type {
  CloseRegionUseCase,
  GetSessionUseCase
} from '@application/regions/close-and-get-session'
import type { CreateRegionUseCase } from '@application/regions/create-region'
import type { ListRegionsUseCase } from '@application/regions/list-regions'
import type { SaveOrganizationUseCase } from '@application/organization/save-organization'
import type { OpenRegionUseCase } from '@application/regions/open-region'
import { IpcChannels } from '@shared/ipc-channels'
import {
  appInfoSchema,
  createRegionInputSchema,
  openRegionInputSchema,
  saveOrganizationInputSchema
} from '@shared/ipc-schemas'
import { type PpmUseCases, registerPpmHandlers } from './register-ppm-handlers'
import { type ProcedureUseCases, registerProcedureHandlers } from './register-procedure-handlers'
import { parseInput, runSafely } from './safe-handler'

export interface UseCases extends PpmUseCases, ProcedureUseCases {
  readonly getAppInfo: GetAppInfoUseCase
  readonly listRegions: ListRegionsUseCase
  readonly createRegion: CreateRegionUseCase
  readonly saveOrganization: SaveOrganizationUseCase
  readonly openRegion: OpenRegionUseCase
  readonly closeRegion: CloseRegionUseCase
  readonly getSession: GetSessionUseCase
}

/** Enregistre les handlers IPC. Entrées validées par Zod ; sorties toujours sous forme d'`ApiResult`. */
export function registerIpcHandlers(useCases: UseCases): void {
  ipcMain.handle(IpcChannels.appGetInfo, () => appInfoSchema.parse(useCases.getAppInfo.execute()))

  ipcMain.handle(IpcChannels.regionsOverview, () => runSafely(() => useCases.listRegions.execute()))

  ipcMain.handle(IpcChannels.regionsCreate, (_event, input: unknown) =>
    runSafely(() => useCases.createRegion.execute(parseInput(createRegionInputSchema, input)))
  )

  ipcMain.handle(IpcChannels.organizationSave, (_event, input: unknown) =>
    runSafely(() =>
      useCases.saveOrganization.execute(parseInput(saveOrganizationInputSchema, input))
    )
  )

  ipcMain.handle(IpcChannels.sessionOpen, (_event, input: unknown) =>
    runSafely(() => useCases.openRegion.execute(parseInput(openRegionInputSchema, input)))
  )

  ipcMain.handle(IpcChannels.sessionClose, () =>
    runSafely(() => {
      useCases.closeRegion.execute()
      return null
    })
  )

  ipcMain.handle(IpcChannels.sessionGet, () =>
    runSafely(() => ({ region: useCases.getSession.execute() }))
  )

  registerPpmHandlers(useCases)
  registerProcedureHandlers(useCases)
}
