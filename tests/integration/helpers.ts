import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Dossier temporaire supprimé par `cleanup()`. */
export function createTempDirectory(): { readonly path: string; cleanup(): void } {
  const path = mkdtempSync(join(tmpdir(), 'prmp-it-'))
  return {
    path,
    cleanup: () => {
      rmSync(path, { recursive: true, force: true })
    }
  }
}
