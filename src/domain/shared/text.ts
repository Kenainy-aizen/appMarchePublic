import { DomainError } from './errors'

export function requiredText(value: string, label: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new DomainError('REQUIRED_FIELD', `Le champ « ${label} » est obligatoire.`)
  }
  return trimmed
}

export function optionalText(value: string | null): string | null {
  if (value === null) return null
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

export function oneOf<T extends string>(value: string, allowed: readonly T[], label: string): T {
  const found = allowed.find((candidate) => candidate === value)
  if (found === undefined) {
    throw new DomainError('INVALID_VALUE', `Valeur invalide pour « ${label} » : « ${value} ».`)
  }
  return found
}
