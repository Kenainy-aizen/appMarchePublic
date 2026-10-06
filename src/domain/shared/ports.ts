/** Identifiants générés par l'application (implémenté par l'infrastructure). */
export interface IdGenerator {
  newId(): string
}

/** Horloge injectable pour garder les cas d'utilisation testables. */
export interface Clock {
  /** Date du jour au format AAAA-MM-JJ. */
  today(): string
  /** Instant courant en millisecondes (pour les délais, pas pour les dates métier). */
  nowMs(): number
}
