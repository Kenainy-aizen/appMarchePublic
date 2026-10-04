import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '@infrastructure/sqlite/database'
import { DatabaseAccessError } from '@infrastructure/sqlite/errors'
import { createTempDirectory } from './helpers'

describe('base chiffrée', () => {
  const temp = { current: createTempDirectory() }
  const goodKey = Buffer.alloc(32, 7)
  const wrongKey = Buffer.alloc(32, 9)
  let file = ''

  beforeEach(() => {
    temp.current = createTempDirectory()
    file = join(temp.current.path, 'region.sqlite')
    const db = openDatabase(file, { key: goodKey })
    db.exec(
      "CREATE TABLE note (texte TEXT NOT NULL) STRICT; INSERT INTO note VALUES ('confidentiel')"
    )
    db.close()
  })

  afterEach(() => {
    temp.current.cleanup()
  })

  it('ne laisse aucun texte lisible dans le fichier', () => {
    expect(readFileSync(file).includes('confidentiel')).toBe(false)
  })

  it('se rouvre avec la bonne clé', () => {
    const db = openDatabase(file, { key: goodKey })
    expect(db.prepare('SELECT texte FROM note').all()).toEqual([{ texte: 'confidentiel' }])
    db.close()
  })

  it('refuse une mauvaise clé', () => {
    expect(() => openDatabase(file, { key: wrongKey })).toThrow(DatabaseAccessError)
  })

  it('refuse une ouverture sans clé', () => {
    expect(() => openDatabase(file)).toThrow(DatabaseAccessError)
  })
})
