/**
 * Noms des canaux IPC. Source unique de vérité pour main et preload.
 * Ce fichier ne doit importer AUCUNE bibliothèque : il est embarqué dans le preload sandboxé.
 */
export const IpcChannels = {
  appGetInfo: 'app:get-info',
  regionsOverview: 'regions:overview',
  regionsCreate: 'regions:create',
  sessionOpen: 'session:open',
  sessionClose: 'session:close',
  sessionGet: 'session:get',
  organizationSave: 'organization:save',
  procedureList: 'procedure:list',
  procedureGet: 'procedure:get',
  procedureCreate: 'procedure:create',
  procedureUpdate: 'procedure:update',
  procedureSaveStepDates: 'procedure:save-step-dates',
  procedureValidateStep: 'procedure:validate-step',
  procedureReopenStep: 'procedure:reopen-step',
  procedureDelete: 'procedure:delete',
  ppmLineList: 'ppm:list-lines',
  ppmList: 'ppm:list',
  ppmGet: 'ppm:get',
  ppmCreate: 'ppm:create',
  ppmSaveLine: 'ppm:save-line',
  ppmRemoveLine: 'ppm:remove-line',
  ppmRecordUpdate: 'ppm:record-update',
  ppmDelete: 'ppm:delete'
} as const
