/** Erreur métier : une règle du domaine est violée. `code` est stable et exploitable par l'interface. */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'DomainError'
  }
}

/** Trop de tentatives de connexion : réessayer après `retryAfterSeconds` secondes. */
export class RateLimitedError extends DomainError {
  constructor(readonly retryAfterSeconds: number) {
    super(
      'RATE_LIMITED',
      `Trop de tentatives. Réessayez dans ${retryAfterSeconds} seconde${retryAfterSeconds > 1 ? 's' : ''}.`
    )
    this.name = 'RateLimitedError'
  }
}
