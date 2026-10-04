import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase, type SqliteDatabase } from '@infrastructure/sqlite/database'
import { migrate } from '@infrastructure/sqlite/migrator'

/** Base en mémoire, migrée à la dernière version. */
export function createMigratedDatabase(): SqliteDatabase {
  const db = openDatabase(':memory:')
  migrate(db)
  return db
}

/** Dossier temporaire supprimé par `cleanup()`. */
export function createTempDirectory(): { readonly path: string; cleanup(): void } {
  const path = mkdtempSync(join(tmpdir(), 'prmp-test-'))
  return {
    path,
    cleanup: () => {
      rmSync(path, { recursive: true, force: true })
    }
  }
}
