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
