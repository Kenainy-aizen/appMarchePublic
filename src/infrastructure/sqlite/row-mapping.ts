import { DataIntegrityError } from './errors'

/** Lit une liste de textes stockée en JSON (ex. comptes budgétaires d'une ligne de PPM). */
export function parseStringArray(json: string, label: string): string[] {
  const parsed: unknown = JSON.parse(json)
  if (!Array.isArray(parsed) || !parsed.every((item): item is string => typeof item === 'string')) {
    throw new DataIntegrityError(`Valeur illisible en base pour « ${label} ».`)
  }
  return parsed
}

/** Paramètre JSON d'identifiants, utilisé avec json_each() pour supprimer les lignes disparues. */
export function idsParameter(ids: readonly string[]): string {
  return JSON.stringify(ids)
}
