/**
 * Test de fumée exécuté DANS le moteur d'Electron (mode Node) : vérifie que le module SQLite chiffré
 * se charge avec le binaire d'Electron et que le chiffrement fonctionne.
 * Lancé par `npm run smoke:sqlite` (voir smoke-sqlite.mjs).
 */
const Database = require('better-sqlite3-multiple-ciphers')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const dir = mkdtempSync(join(tmpdir(), 'prmp-smoke-'))
const file = join(dir, 'smoke.sqlite')
try {
  const key = Buffer.alloc(32, 5)
  const db = new Database(file)
  db.pragma("cipher='sqlcipher'")
  db.pragma(`key = "x'${key.toString('hex')}'"`)
  db.exec("CREATE TABLE t (x TEXT NOT NULL) STRICT; INSERT INTO t VALUES ('ok')")
  db.close()

  const reopened = new Database(file)
  reopened.pragma("cipher='sqlcipher'")
  reopened.pragma(`key = "x'${key.toString('hex')}'"`)
  const value = reopened.prepare('SELECT x FROM t').get().x
  reopened.close()

  let wrongKeyRejected = false
  try {
    const bad = new Database(file)
    bad.pragma("cipher='sqlcipher'")
    bad.pragma(`key = "x'${Buffer.alloc(32, 6).toString('hex')}'"`)
    bad.prepare('SELECT x FROM t').get()
  } catch {
    wrongKeyRejected = true
  }

  const ok = value === 'ok' && wrongKeyRejected
  console.log(
    `${ok ? 'OK' : 'ÉCHEC'} — Node ${process.versions.node}, Electron ${process.versions.electron ?? '(absent)'}, ` +
      `lecture=${value}, mauvaise clé refusée=${wrongKeyRejected}`
  )
  process.exitCode = ok ? 0 : 1
} finally {
  rmSync(dir, { recursive: true, force: true })
}
