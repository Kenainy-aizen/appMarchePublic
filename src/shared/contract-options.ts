/**
 * Types de contrat, événements d'exécution et situations, avec libellés français, partagés entre l'interface
 * et le processus principal. Un test vérifie que ces codes et libellés restent identiques à ceux du domaine.
 */
export const CONTRACT_KIND_CODES = ['MARCHE', 'CONVENTION', 'ACHAT_DIRECT'] as const
export type ContractKindCode = (typeof CONTRACT_KIND_CODES)[number]

export const CONTRACT_KIND_LABELS: Readonly<Record<ContractKindCode, string>> = {
  MARCHE: 'Marché',
  CONVENTION: 'Convention',
  ACHAT_DIRECT: 'Achat direct'
}

export const CONTRACT_EVENT_CODES = [
  'ORDRE_SERVICE_DEMARRAGE',
  'ORDRE_SERVICE_ARRET',
  'ORDRE_SERVICE_REPRISE',
  'RECEPTION_PROVISOIRE',
  'RECEPTION_DEFINITIVE',
  'AVENANT',
  'CLOTURE'
] as const
export type ContractEventCode = (typeof CONTRACT_EVENT_CODES)[number]

export const CONTRACT_EVENT_LABELS: Readonly<Record<ContractEventCode, string>> = {
  ORDRE_SERVICE_DEMARRAGE: 'Ordre de service de démarrage',
  ORDRE_SERVICE_ARRET: 'Ordre de service d’arrêt',
  ORDRE_SERVICE_REPRISE: 'Ordre de service de reprise',
  RECEPTION_PROVISOIRE: 'Réception provisoire',
  RECEPTION_DEFINITIVE: 'Réception définitive',
  AVENANT: 'Avenant',
  CLOTURE: 'Clôture du contrat'
}

export const CONTRACT_STATUS_CODES = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'STOPPED',
  'PROVISIONALLY_RECEIVED',
  'FINALLY_RECEIVED',
  'CLOSED'
] as const
export type ContractStatusCode = (typeof CONTRACT_STATUS_CODES)[number]

export const CONTRACT_STATUS_LABELS: Readonly<Record<ContractStatusCode, string>> = {
  NOT_STARTED: 'Non démarré',
  IN_PROGRESS: 'En cours d’exécution',
  STOPPED: 'Arrêté',
  PROVISIONALLY_RECEIVED: 'Reçu provisoirement',
  FINALLY_RECEIVED: 'Reçu définitivement',
  CLOSED: 'Clôturé'
}
