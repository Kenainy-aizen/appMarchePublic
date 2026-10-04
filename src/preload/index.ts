import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { AppInfoDto, PrmpApi } from '@shared/api'

const api: PrmpApi = {
  getAppInfo: (): Promise<AppInfoDto> =>
    ipcRenderer.invoke(IpcChannels.appGetInfo) as Promise<AppInfoDto>
}

contextBridge.exposeInMainWorld('api', api)
