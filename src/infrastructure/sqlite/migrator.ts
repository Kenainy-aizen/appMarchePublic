import type { SqliteDatabase } from './database'
import { DatabaseTooNewError } from './errors'
import { initialSchema } from './migrations/001-initial-schema'

export interface Migration {
  readonly version: number
  readonly name: string
  readonly sql: string
}

/** Liste ordonnée des migrations. On n'y modifie jamais une entrée existante : on en ajoute une. */
export const MIGRATIONS: readonly Migration[] = [initialSchema]

function readVersion(db: SqliteDatabase): number {
  return db.pragma('user_version', { simple: true }) as number
}

/**
 * Applique les migrations manquantes (suivi par PRAGMA user_version), chacune dans une transaction.
 * Refuse d'ouvrir une base plus récente que l'application. Retourne la version finale.
 */
export function migrate(db: SqliteDatabase, migrations: readonly Migration[] = MIGRATIONS): number {
  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new Error(
        `Les migrations doivent être numérotées 1, 2, 3… (reçu ${migration.version}).`
      )
    }
  })

  const supported = migrations.length
  const current = readVersion(db)
  if (current > supported) throw new DatabaseTooNewError(current, supported)

  for (const migration of migrations.slice(current)) {
    db.transaction(() => {
      db.exec(migration.sql)
      db.pragma(`user_version = ${migration.version}`)
    })()
  }
  return readVersion(db)
}
