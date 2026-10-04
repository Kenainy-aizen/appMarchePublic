import { describe, expect, it } from 'vitest'
import { CONTRACT_EVENT_KINDS, CONTRACT_KINDS } from '@domain/contract'
import { PROCEDURE_METHODS, STEP_KINDS } from '@domain/procedure'
import { PROCUREMENT_NATURES } from '@domain/ppm'
import { openDatabase } from '@infrastructure/sqlite/database'
import { DatabaseTooNewError } from '@infrastructure/sqlite/errors'
import { MIGRATIONS, migrate } from '@infrastructure/sqlite/migrator'
import { createMigratedDatabase } from './helpers'

describe('migrate', () => {
  it('amène une base vide à la dernière version', () => {
    const db = openDatabase(':memory:')
    expect(migrate(db)).toBe(MIGRATIONS.length)
  })

  it('est idempotente', () => {
    const db = openDatabase(':memory:')
    migrate(db)
    expect(migrate(db)).toBe(MIGRATIONS.length)
  })

  it('refuse une base plus récente que l’application', () => {
    const db = openDatabase(':memory:')
    db.pragma(`user_version = ${MIGRATIONS.length + 1}`)
    expect(() => migrate(db)).toThrow(DatabaseTooNewError)
  })

  it('annule entièrement une migration qui échoue', () => {
    const db = openDatabase(':memory:')
    const broken = [
      { version: 1, name: 'cassée', sql: 'CREATE TABLE a (x TEXT); CREATE TABLE a (y TEXT);' }
    ]
    expect(() => migrate(db, broken)).toThrow()
    expect(db.pragma('user_version', { simple: true })).toBe(0)
    expect(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'a'").get()).toEqual({
      n: 0
    })
  })

  it('refuse des numéros de migration non consécutifs', () => {
    const db = openDatabase(':memory:')
    expect(() => migrate(db, [{ version: 2, name: 'x', sql: 'SELECT 1' }])).toThrow()
  })
})

describe('cohérence schéma / domaine (garde-fou contre la dérive)', () => {
  const db = createMigratedDatabase()

  it('les CHECK du schéma acceptent exactement les valeurs du domaine', () => {
    const accepts = (sql: string, value: string): boolean => {
      db.exec('SAVEPOINT s')
      try {
        db.prepare(sql).run(value)
        return true
      } catch {
        return false
      } finally {
        db.exec('ROLLBACK TO s; RELEASE s')
      }
    }
    db.exec("INSERT INTO ppm (id, year, number, elaborated_on) VALUES ('p', 2026, 1, '2026-01-01')")
    db.exec("INSERT INTO candidate (id, name) VALUES ('c', 'X')")
    db.exec(
      "INSERT INTO procedure (id, reference, object, method, created_on) VALUES ('pr', 'R', 'O', 'DAO', '2026-01-01')"
    )
    db.exec(
      "INSERT INTO contract (id, reference, kind, holder_id, object, amount) VALUES ('k', 'K', 'ACHAT_DIRECT', 'c', 'O', 1)"
    )

    const natureSql =
      "INSERT INTO ppm_line (id, ppm_id, position, nature, object) VALUES (lower(hex(randomblob(4))), 'p', 0, ?, 'O')"
    const methodSql =
      "INSERT INTO procedure (id, reference, object, method, created_on) VALUES (lower(hex(randomblob(4))), lower(hex(randomblob(4))), 'O', ?, '2026-01-01')"
    const stepSql = "INSERT INTO procedure_step (procedure_id, kind) VALUES ('pr', ?)"
    const kindSql =
      "INSERT INTO contract (id, reference, kind, procedure_id, holder_id, object, amount) VALUES (lower(hex(randomblob(4))), lower(hex(randomblob(4))), ?, 'pr', 'c', 'O', 1)"
    const eventSql =
      "INSERT INTO contract_event (id, contract_id, position, kind, occurred_on, amount_delta) VALUES (lower(hex(randomblob(4))), 'k', 0, ?, '2026-01-01', 1)"

    for (const value of PROCUREMENT_NATURES) expect(accepts(natureSql, value), value).toBe(true)
    for (const value of PROCEDURE_METHODS) expect(accepts(methodSql, value), value).toBe(true)
    for (const value of STEP_KINDS) expect(accepts(stepSql, value), value).toBe(true)
    for (const value of CONTRACT_KINDS) expect(accepts(kindSql, value), value).toBe(true)
    for (const value of CONTRACT_EVENT_KINDS) expect(accepts(eventSql, value), value).toBe(true)

    expect(accepts(natureSql, 'INCONNU')).toBe(false)
    expect(accepts(methodSql, 'INCONNU')).toBe(false)
  })
})
