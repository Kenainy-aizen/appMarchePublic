import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * Écriture atomique : fichier temporaire puis renommage, pour ne jamais laisser un fichier à moitié écrit
 * (coupure de courant, fermeture brutale). Crée le dossier au besoin ; fichier réservé à l'utilisateur (0600).
 */
export function writeFileAtomically(filePath: string, content: string): void {
  mkdirSync(dirname(filePath), { recursive: true })
  const temporary = `${filePath}.tmp`
  writeFileSync(temporary, content, { mode: 0o600 })
  renameSync(temporary, filePath)
}
