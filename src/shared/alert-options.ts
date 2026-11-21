/**
 * Délais d'alerte proposés dans les Paramètres, avec leurs libellés français, partagés entre l'interface et le
 * processus principal. Un test vérifie qu'ils restent identiques à ceux du domaine.
 */
export const ALERT_HORIZON_CHOICES = [7, 15, 30, 60] as const
export type AlertHorizonChoice = (typeof ALERT_HORIZON_CHOICES)[number]

export const ALERT_HORIZON_LABELS: Readonly<Record<AlertHorizonChoice, string>> = {
  7: '7 jours',
  15: '15 jours',
  30: '30 jours',
  60: '60 jours'
}
