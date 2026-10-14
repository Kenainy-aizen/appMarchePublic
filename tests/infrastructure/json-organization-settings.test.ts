import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { JsonOrganizationSettings } from '@infrastructure/json-organization-settings'
import { createTempDirectory } from './helpers'

const temp = { current: createTempDirectory() }
beforeEach(() => {
  temp.current = createTempDirectory()
})
afterEach(() => {
  temp.current.cleanup()
})

describe('JsonOrganizationSettings', () => {
  it('n’a pas de nom tant que rien n’est enregistré', () => {
    expect(
      new JsonOrganizationSettings(join(temp.current.path, 'settings.json')).getName()
    ).toBeNull()
  })

  it('conserve le nom d’une instance à l’autre, dossier créé au besoin, sans fichier temporaire', () => {
    const file = join(temp.current.path, 'sous-dossier', 'settings.json')
    new JsonOrganizationSettings(file).saveName('PRMP — Ministère de l’Environnement')

    expect(new JsonOrganizationSettings(file).getName()).toBe('PRMP — Ministère de l’Environnement')
    expect(existsSync(`${file}.tmp`)).toBe(false)
  })

  it('remplace le nom précédent', () => {
    const settings = new JsonOrganizationSettings(join(temp.current.path, 'settings.json'))
    settings.saveName('Ancien nom')
    settings.saveName('Nouveau nom')
    expect(settings.getName()).toBe('Nouveau nom')
  })

  it('ignore un fichier illisible au lieu de bloquer l’application, et le répare à la prochaine écriture', () => {
    const file = join(temp.current.path, 'settings.json')
    for (const contenu of ['pas du json', '{"version":2}', '{"version":1,"organizationName":42}']) {
      writeFileSync(file, contenu)
      expect(new JsonOrganizationSettings(file).getName()).toBeNull()
    }

    const settings = new JsonOrganizationSettings(file)
    settings.saveName('Réparé')
    expect(settings.getName()).toBe('Réparé')
  })

  it('ne contient que le nom (aucun secret)', () => {
    const file = join(temp.current.path, 'settings.json')
    new JsonOrganizationSettings(file).saveName('PRMP')
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ version: 1, organizationName: 'PRMP' })
  })
})
