import { ipcMain } from 'electron'
import type { GetAppInfoUseCase } from '@application/get-app-info'
import { IpcChannels } from '@shared/ipc-channels'
import { appInfoSchema } from '@shared/ipc-schemas'

export interface UseCases {
  readonly getAppInfo: GetAppInfoUseCase
}

/** Enregistre les handlers IPC. Chaque réponse est validée par Zod avant d'être renvoyée. */
export function registerIpcHandlers(useCases: UseCases): void {
  ipcMain.handle(IpcChannels.appGetInfo, () => appInfoSchema.parse(useCases.getAppInfo.execute()))
}
