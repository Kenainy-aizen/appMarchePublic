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
    ipcRenderer.invoke(IpcChannels.ppmDelete, input) as ReturnType<PrmpApi['deletePpm']>,
  listPpmLines: () =>
    ipcRenderer.invoke(IpcChannels.ppmLineList) as ReturnType<PrmpApi['listPpmLines']>,
  listProcedures: () =>
    ipcRenderer.invoke(IpcChannels.procedureList) as ReturnType<PrmpApi['listProcedures']>,
  getProcedure: (input) =>
    ipcRenderer.invoke(IpcChannels.procedureGet, input) as ReturnType<PrmpApi['getProcedure']>,
  createProcedure: (input) =>
    ipcRenderer.invoke(IpcChannels.procedureCreate, input) as ReturnType<
      PrmpApi['createProcedure']
    >,
  updateProcedure: (input) =>
    ipcRenderer.invoke(IpcChannels.procedureUpdate, input) as ReturnType<
      PrmpApi['updateProcedure']
    >,
  saveStepDates: (input) =>
    ipcRenderer.invoke(IpcChannels.procedureSaveStepDates, input) as ReturnType<
      PrmpApi['saveStepDates']
    >,
  validateStep: (input) =>
    ipcRenderer.invoke(IpcChannels.procedureValidateStep, input) as ReturnType<
      PrmpApi['validateStep']
    >,
  reopenStep: (input) =>
    ipcRenderer.invoke(IpcChannels.procedureReopenStep, input) as ReturnType<PrmpApi['reopenStep']>,
  deleteProcedure: (input) =>
    ipcRenderer.invoke(IpcChannels.procedureDelete, input) as ReturnType<
      PrmpApi['deleteProcedure']
    >,
  addBid: (input) =>
    ipcRenderer.invoke(IpcChannels.procedureAddBid, input) as ReturnType<PrmpApi['addBid']>,
  updateBid: (input) =>
    ipcRenderer.invoke(IpcChannels.procedureUpdateBid, input) as ReturnType<PrmpApi['updateBid']>,
  removeBid: (input) =>
    ipcRenderer.invoke(IpcChannels.procedureRemoveBid, input) as ReturnType<PrmpApi['removeBid']>,
  setAward: (input) =>
    ipcRenderer.invoke(IpcChannels.procedureSetAward, input) as ReturnType<PrmpApi['setAward']>,
  listCandidates: () =>
    ipcRenderer.invoke(IpcChannels.candidateList) as ReturnType<PrmpApi['listCandidates']>,
  createCandidate: (input) =>
    ipcRenderer.invoke(IpcChannels.candidateCreate, input) as ReturnType<
      PrmpApi['createCandidate']
    >,
  updateCandidate: (input) =>
    ipcRenderer.invoke(IpcChannels.candidateUpdate, input) as ReturnType<
      PrmpApi['updateCandidate']
    >,
  deleteCandidate: (input) =>
    ipcRenderer.invoke(IpcChannels.candidateDelete, input) as ReturnType<
      PrmpApi['deleteCandidate']
    >,
  listContracts: () =>
    ipcRenderer.invoke(IpcChannels.contractList) as ReturnType<PrmpApi['listContracts']>,
  getContract: (input) =>
    ipcRenderer.invoke(IpcChannels.contractGet, input) as ReturnType<PrmpApi['getContract']>,
  createContract: (input) =>
    ipcRenderer.invoke(IpcChannels.contractCreate, input) as ReturnType<PrmpApi['createContract']>,
  updateContract: (input) =>
    ipcRenderer.invoke(IpcChannels.contractUpdate, input) as ReturnType<PrmpApi['updateContract']>,
  deleteContract: (input) =>
    ipcRenderer.invoke(IpcChannels.contractDelete, input) as ReturnType<PrmpApi['deleteContract']>,
  addContractEvent: (input) =>
    ipcRenderer.invoke(IpcChannels.contractAddEvent, input) as ReturnType<
      PrmpApi['addContractEvent']
    >,
  removeLastContractEvent: (input) =>
    ipcRenderer.invoke(IpcChannels.contractRemoveLastEvent, input) as ReturnType<
      PrmpApi['removeLastContractEvent']
    >,
  listContractableProcedures: () =>
    ipcRenderer.invoke(IpcChannels.contractableProcedureList) as ReturnType<
      PrmpApi['listContractableProcedures']
    >,
  listAlerts: () => ipcRenderer.invoke(IpcChannels.alertList) as ReturnType<PrmpApi['listAlerts']>,
  saveAlertHorizon: (input) =>
    ipcRenderer.invoke(IpcChannels.settingsSaveAlertHorizon, input) as ReturnType<
      PrmpApi['saveAlertHorizon']
    >,
  listAttachments: (input) =>
    ipcRenderer.invoke(IpcChannels.attachmentList, input) as ReturnType<PrmpApi['listAttachments']>,
  addAttachment: (input) =>
    ipcRenderer.invoke(IpcChannels.attachmentAdd, input) as ReturnType<PrmpApi['addAttachment']>,
  removeAttachment: (input) =>
    ipcRenderer.invoke(IpcChannels.attachmentRemove, input) as ReturnType<
      PrmpApi['removeAttachment']
    >,
  exportAttachment: (input) =>
    ipcRenderer.invoke(IpcChannels.attachmentExport, input) as ReturnType<
      PrmpApi['exportAttachment']
    >
}

contextBridge.exposeInMainWorld('api', api)
