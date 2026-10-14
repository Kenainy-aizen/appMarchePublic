import { describe, expect, it } from 'vitest'
import { ORGANIZATION_NAME_MAX_LENGTH, parseOrganizationName } from '@domain/organization'
import { DomainError } from '@domain/shared/errors'

const codeOf = (action: () => unknown): string => {
  try {
    action()
  } catch (error) {
    if (error instanceof DomainError) return error.code
    throw error
  }
  return 'AUCUNE_ERREUR'
}

describe('parseOrganizationName', () => {
  it('conserve accents, apostrophes et tirets', () => {
    expect(parseOrganizationName('PRMP du Ministère de l’Environnement — Fianarantsoa')).toBe(
      'PRMP du Ministère de l’Environnement — Fianarantsoa'
    )
  })

  it('retire les espaces en trop, au début, à la fin et au milieu', () => {
    expect(parseOrganizationName('  PRMP   Haute  Matsiatra \t')).toBe('PRMP Haute Matsiatra')
  })

  it.each(['', '   ', '\n\t'])('refuse un nom vide (« %s »)', (value) => {
    expect(codeOf(() => parseOrganizationName(value))).toBe('REQUIRED_FIELD')
  })

  it('accepte exactement la longueur maximale et refuse au-delà', () => {
    expect(parseOrganizationName('a'.repeat(ORGANIZATION_NAME_MAX_LENGTH))).toHaveLength(
      ORGANIZATION_NAME_MAX_LENGTH
    )
    expect(codeOf(() => parseOrganizationName('a'.repeat(ORGANIZATION_NAME_MAX_LENGTH + 1)))).toBe(
      'ORGANIZATION_NAME_TOO_LONG'
    )
  })

  it('refuse un caractère de contrôle', () => {
    expect(codeOf(() => parseOrganizationName(`PRMP${String.fromCharCode(7)}`))).toBe(
      'INVALID_VALUE'
    )
  })
})
