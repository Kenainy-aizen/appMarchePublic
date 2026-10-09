import { ZodError, type ZodType } from 'zod'
import { DomainError, RateLimitedError } from '@domain/shared/errors'
import type { ApiResult } from '@shared/api'

/**
 * Exécute une commande et transforme TOUTE issue en `ApiResult` :
 *  - erreur métier : son message français est transmis tel quel ;
 *  - entrée invalide : « requête invalide » ;
 *  - tout le reste : message générique (le détail reste dans le journal du processus principal,
 *    pour ne jamais exposer de chemin, de clé ou de trace à l'interface).
 */
export async function runSafely<T>(action: () => Promise<T> | T): Promise<ApiResult<T>> {
  try {
    return { ok: true, value: await action() }
  } catch (error) {
    if (error instanceof RateLimitedError) {
      return {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          retryAfterSeconds: error.retryAfterSeconds
        }
      }
    }
    if (error instanceof DomainError) {
      return { ok: false, error: { code: error.code, message: error.message } }
    }
    if (error instanceof ZodError) {
      return { ok: false, error: { code: 'INVALID_REQUEST', message: 'Requête invalide.' } }
    }
    console.error('[IPC] erreur inattendue :', error)
    return {
      ok: false,
      error: { code: 'UNEXPECTED', message: 'Une erreur inattendue est survenue.' }
    }
  }
}

/** Valide l'entrée reçue de l'interface (non fiable par principe) avant de l'utiliser. */
export function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  return schema.parse(input)
}
