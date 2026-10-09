import Database from 'better-sqlite3-multiple-ciphers'
import { DatabaseAccessError } from './errors'

export type SqliteDatabase = Database.Database

export const DATABASE_KEY_LENGTH = 32

export interface OpenDatabaseOptions {
  /** Clé de chiffrement de 32 octets, ALÉATOIRE (la « clé de données » de la région, voir ADR-015). */
  readonly key?: Buffer
}

/**
 * Ouvre (ou crée) une base SQLite. Si une clé est fournie, la base est chiffrée (SQLCipher).
 * Une clé absente ou incorrecte est détectée immédiatement : DatabaseAccessError.
 *
 * La clé est transmise au format « clé brute » de SQLCipher (x'<64 caractères hexadécimaux>') : elle est utilisée
 * telle quelle, sans dérivation. C'est volontaire (ADR-022) : la clé est déjà aléatoire sur 256 bits, et la
 * dérivation par défaut (PBKDF2, 256 000 itérations) coûtait plusieurs secondes à chaque ouverture sur un
 * poste lent sans rien apporter. La protection par mot de passe est assurée AILLEURS, par scrypt (ADR-015).
 * Ne JAMAIS passer ici un mot de passe saisi par l'utilisateur.
 */
export function openDatabase(path: string, options: OpenDatabaseOptions = {}): SqliteDatabase {
  const db = new Database(path)
  try {
    if (options.key !== undefined) {
      if (options.key.length !== DATABASE_KEY_LENGTH) {
        throw new Error(`La clé de la base doit faire ${DATABASE_KEY_LENGTH} octets.`)
      }
      db.pragma("cipher='sqlcipher'")
      db.pragma(`key = "x'${options.key.toString('hex')}'"`)
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
