/**
 * Noms des canaux IPC. Source unique de vérité pour main et preload.
 * Ce fichier ne doit importer AUCUNE bibliothèque : il est embarqué dans le preload sandboxé.
 */
export const IpcChannels = {
  appGetInfo: 'app:get-info'
} as const
