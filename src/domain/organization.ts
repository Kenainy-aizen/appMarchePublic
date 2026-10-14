import { DomainError } from './shared/errors'
import { requiredText } from './shared/text'

export const ORGANIZATION_NAME_MAX_LENGTH = 120

function hasControlCharacter(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    if (code < 32 || code === 127) return true
  }
  return false
}

/**
 * Nom de la PRMP, affiché en tête de l'application et sur les futurs états imprimés.
 * Les espaces superflus sont retirés ; le texte est par ailleurs libre (accents, apostrophes, tirets).
 */
export function parseOrganizationName(value: string): string {
  const name = requiredText(value, 'nom de la PRMP').replace(/\s+/g, ' ')
  if (hasControlCharacter(name)) {
    throw new DomainError('INVALID_VALUE', 'Le nom de la PRMP contient un caractère non autorisé.')
  }
  if (name.length > ORGANIZATION_NAME_MAX_LENGTH) {
    throw new DomainError(
      'ORGANIZATION_NAME_TOO_LONG',
      `Le nom de la PRMP ne doit pas dépasser ${ORGANIZATION_NAME_MAX_LENGTH} caractères.`
    )
  }
  return name
}
