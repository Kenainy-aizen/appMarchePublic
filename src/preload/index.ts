import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannels } from '@shared/ipc-channels'
import type { PrmpApi } from '@shared/api'

const api: PrmpApi = {
  getAppInfo: () => ipcRenderer.invoke(IpcChannels.appGetInfo) as ReturnType<PrmpApi['getAppInfo']>,
  getRegionsOverview: () =>
    ipcRenderer.invoke(IpcChannels.regionsOverview) as ReturnType<PrmpApi['getRegionsOverview']>,
  createRegion: (input) =>
    ipcRenderer.invoke(IpcChannels.regionsCreate, input) as ReturnType<PrmpApi['createRegion']>,
  openRegion: (input) =>
    ipcRenderer.invoke(IpcChannels.sessionOpen, input) as ReturnType<PrmpApi['openRegion']>,
  closeSession: () =>
    ipcRenderer.invoke(IpcChannels.sessionClose) as ReturnType<PrmpApi['closeSession']>,
  getSession: () => ipcRenderer.invoke(IpcChannels.sessionGet) as ReturnType<PrmpApi['getSession']>
}

contextBridge.exposeInMainWorld('api', api)
