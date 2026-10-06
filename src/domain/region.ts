import { DomainError } from './shared/errors'

/** La PRMP dirige trois régions au plus. */
export const MAX_REGIONS = 3
export const MIN_PASSWORD_LENGTH = 10
export const MAX_REGION_NAME_LENGTH = 60

/** Une région telle que l'application la présente : jamais de clé ni de secret. */
export interface RegionSummary {
  readonly id: string
  readonly name: string
}

/** Nettoie le nom saisi (espaces de début, de fin et répétés) et le valide. */
export function validateRegionName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, ' ')
  if (name.length === 0) {
    throw new DomainError('REGION_NAME_REQUIRED', 'Le nom de la région est obligatoire.')
  }
  if (name.length > MAX_REGION_NAME_LENGTH) {
    throw new DomainError(
      'REGION_NAME_TOO_LONG',
      `Le nom de la région ne doit pas dépasser ${MAX_REGION_NAME_LENGTH} caractères.`
    )
  }
  return name
}

/** Forme de comparaison d'un nom : sans accent, sans majuscule, espaces normalisés. */
function comparable(name: string): string {
  return name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ')
}

/** Deux noms désignent la même région s'ils ne diffèrent que par la casse, les accents ou les espaces. */
export function sameRegionName(a: string, b: string): boolean {
  return comparable(a) === comparable(b)
}

/**
 * Règle de mot de passe : longueur minimale seulement (pas de règle de composition, peu utiles).
 * Un mot de passe composé uniquement d'espaces est refusé.
 */
export function validateNewPassword(password: string, confirmation: string): void {
  if (password.trim().length === 0 || password.length < MIN_PASSWORD_LENGTH) {
    throw new DomainError(
      'WEAK_PASSWORD',
      `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`
    )
  }
  if (password !== confirmation) {
    throw new DomainError(
      'PASSWORD_MISMATCH',
      'Le mot de passe et sa confirmation ne sont pas identiques.'
    )
  }
}

/** Premier nom « Région N » encore libre (N = 1, 2, 3…). */
export function suggestRegionName(existingNames: readonly string[]): string {
  for (let number = 1; ; number += 1) {
    const candidate = `Région ${number}`
    if (!existingNames.some((existing) => sameRegionName(existing, candidate))) return candidate
  }
}
