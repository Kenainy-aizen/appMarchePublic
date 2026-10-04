/** Identifiants générés par l'application (implémenté par l'infrastructure). */
export interface IdGenerator {
  newId(): string
}

/** Horloge injectable pour garder les cas d'utilisation testables. */
export interface Clock {
  today(): string
}
