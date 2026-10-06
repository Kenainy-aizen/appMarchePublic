import type { ApiResult } from '@shared/api'

/** Erreur lisible par l'utilisateur, issue d'une réponse `ok: false` du processus principal. */
export class ApiFailure extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'ApiFailure'
  }
}

/** Retourne la valeur d'un résultat, ou lève une `ApiFailure` portant le message français à afficher. */
export function unwrap<T>(result: ApiResult<T>): T {
  if (result.ok) return result.value
  throw new ApiFailure(result.error.code, result.error.message)
}

/** Message à afficher pour n'importe quelle erreur capturée dans un écran. */
export function messageOf(error: unknown): string {
  return error instanceof ApiFailure ? error.message : 'Une erreur inattendue est survenue.'
}
