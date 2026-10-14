/**
 * Listes de valeurs et libellés français du plan de passation, partagés entre l'interface (listes déroulantes)
 * et le processus principal (validation). Aucune dépendance : ce fichier est importable partout.
 * Un test vérifie que ces codes restent identiques à ceux du domaine.
 */
export const NATURE_CODES = [
  'TRAVAUX',
  'FOURNITURES',
  'SERVICES',
  'PRESTATIONS_INTELLECTUELLES'
] as const
export type NatureCode = (typeof NATURE_CODES)[number]

export const NATURE_LABELS: Readonly<Record<NatureCode, string>> = {
  TRAVAUX: 'Travaux',
  FOURNITURES: 'Fournitures',
  SERVICES: 'Services',
  PRESTATIONS_INTELLECTUELLES: 'Prestations intellectuelles'
}

export const METHOD_CODES = ['DAO', 'AOR', 'DCP', 'AMI', 'APQ'] as const
export type MethodCode = (typeof METHOD_CODES)[number]

export const METHOD_LABELS: Readonly<Record<MethodCode, string>> = {
  DAO: 'Appel d’offres ouvert (DAO)',
  AOR: 'Appel d’offres restreint (AOR)',
  DCP: 'Consultation de prix (DCP)',
  AMI: 'Appel à manifestation d’intérêt (AMI)',
  APQ: 'Appel à préqualification (APQ)'
}
