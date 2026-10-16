/**
 * Étapes et statuts d'une procédure, avec leurs libellés français, partagés entre l'interface et le
 * processus principal. Un test vérifie que ces codes et libellés restent identiques à ceux du domaine.
 */
export const STEP_CODES = [
  'PUBLICATION',
  'OUVERTURE_PLIS',
  'EVALUATION',
  'ATTRIBUTION',
  'APPROBATION'
] as const
export type StepCode = (typeof STEP_CODES)[number]

export const STEP_LABELS: Readonly<Record<StepCode, string>> = {
  PUBLICATION: 'Publication de l’avis',
  OUVERTURE_PLIS: 'Ouverture des plis',
  EVALUATION: 'Évaluation des offres',
  ATTRIBUTION: 'Attribution',
  APPROBATION: 'Approbation du marché'
}

export const STATUS_CODES = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'] as const
export type StatusCode = (typeof STATUS_CODES)[number]

export const STATUS_LABELS: Readonly<Record<StatusCode, string>> = {
  NOT_STARTED: 'Non démarrée',
  IN_PROGRESS: 'En cours',
  COMPLETED: 'Terminée'
}
