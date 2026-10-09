import { RateLimitedError } from '@domain/shared/errors'

/** Après 5 échecs consécutifs : blocage de 30 s, doublé à chaque échec supplémentaire, plafonné à 5 min. */
const FREE_ATTEMPTS = 5
const BASE_LOCK_MS = 30_000
const MAX_LOCK_MS = 300_000

interface Entry {
  failures: number
  lockedUntilMs: number
}

/**
 * Freine les essais de mots de passe à l'écran (en mémoire, remis à zéro au redémarrage).
 * Il protège contre quelqu'un assis devant le poste ; il ne protège pas d'une attaque sur un fichier
 * copié : celle-ci est freinée par la lenteur de scrypt et par la longueur minimale du mot de passe.
 */
export class LoginThrottle {
  private readonly entries = new Map<string, Entry>()

  /** @throws RateLimitedError si la région est temporairement verrouillée. */
  assertAllowed(regionId: string, nowMs: number): void {
    const entry = this.entries.get(regionId)
    if (entry && entry.lockedUntilMs > nowMs) {
      throw new RateLimitedError(Math.ceil((entry.lockedUntilMs - nowMs) / 1000))
    }
  }

  recordFailure(regionId: string, nowMs: number): void {
    const entry = this.entries.get(regionId) ?? { failures: 0, lockedUntilMs: 0 }
    entry.failures += 1
    if (entry.failures >= FREE_ATTEMPTS) {
      const lock = Math.min(BASE_LOCK_MS * 2 ** (entry.failures - FREE_ATTEMPTS), MAX_LOCK_MS)
      entry.lockedUntilMs = nowMs + lock
    }
    this.entries.set(regionId, entry)
  }

  recordSuccess(regionId: string): void {
    this.entries.delete(regionId)
  }
}
