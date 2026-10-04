import Database from 'better-sqlite3-multiple-ciphers'
import { DatabaseAccessError } from './errors'

export type SqliteDatabase = Database.Database

export interface OpenDatabaseOptions {
  /** Clé de chiffrement de 32 octets (dérivée du mot de passe de la région en Phase 3). */
  readonly key?: Buffer
}

/**
 * Ouvre (ou crée) une base SQLite. Si une clé est fournie, la base est chiffrée (SQLCipher).
 * Une clé absente ou incorrecte est détectée immédiatement : DatabaseAccessError.
 */
export function openDatabase(path: string, options: OpenDatabaseOptions = {}): SqliteDatabase {
  const db = new Database(path)
  try {
    if (options.key !== undefined) {
      db.pragma("cipher='sqlcipher'")
      db.key(options.key)
    }
    // Lecture de contrôle : échoue ici si la clé est fausse ou si le fichier n'est pas une base.
    db.prepare('SELECT count(*) FROM sqlite_master').get()
    db.pragma('foreign_keys = ON')
    return db
  } catch (cause) {
    db.close()
    throw new DatabaseAccessError(
      'Impossible d’ouvrir la base de données : mot de passe incorrect ou fichier corrompu.',
      { cause }
    )
  }
}
