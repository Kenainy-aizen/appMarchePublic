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
  saveOrganization: (input) =>
    ipcRenderer.invoke(IpcChannels.organizationSave, input) as ReturnType<
      PrmpApi['saveOrganization']
    >,
  closeSession: () =>
    ipcRenderer.invoke(IpcChannels.sessionClose) as ReturnType<PrmpApi['closeSession']>,
  getSession: () => ipcRenderer.invoke(IpcChannels.sessionGet) as ReturnType<PrmpApi['getSession']>,
  listPpms: () => ipcRenderer.invoke(IpcChannels.ppmList) as ReturnType<PrmpApi['listPpms']>,
  getPpm: (input) => ipcRenderer.invoke(IpcChannels.ppmGet, input) as ReturnType<PrmpApi['getPpm']>,
  createPpm: (input) =>
    ipcRenderer.invoke(IpcChannels.ppmCreate, input) as ReturnType<PrmpApi['createPpm']>,
  savePpmLine: (input) =>
    ipcRenderer.invoke(IpcChannels.ppmSaveLine, input) as ReturnType<PrmpApi['savePpmLine']>,
  removePpmLine: (input) =>
    ipcRenderer.invoke(IpcChannels.ppmRemoveLine, input) as ReturnType<PrmpApi['removePpmLine']>,
  recordPpmUpdate: (input) =>
    ipcRenderer.invoke(IpcChannels.ppmRecordUpdate, input) as ReturnType<
      PrmpApi['recordPpmUpdate']
    >,
  deletePpm: (input) =>
    ipcRenderer.invoke(IpcChannels.ppmDelete, input) as ReturnType<PrmpApi['deletePpm']>
}

contextBridge.exposeInMainWorld('api', api)
