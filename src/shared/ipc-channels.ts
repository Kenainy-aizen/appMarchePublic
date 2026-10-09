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
  sessionGet: 'session:get'
} as const
