import { DomainError } from './errors'

declare const ariaryBrand: unique symbol

/** Montant en Ariary (Ar) : entier positif ou nul (pas de sous-unité utilisée en pratique). */
export type Ariary = number & { readonly [ariaryBrand]: true }

export function ariary(value: number): Ariary {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DomainError('INVALID_AMOUNT', `Montant invalide : ${value} (entier ≥ 0 attendu).`)
  }
  return value as Ariary
}

export function sumAriary(values: readonly Ariary[]): Ariary {
  return ariary(values.reduce<number>((total, value) => total + value, 0))
}
