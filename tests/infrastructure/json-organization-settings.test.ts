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

  it('ne contient que le nom et le délai d’alerte (aucun secret)', () => {
    const file = join(temp.current.path, 'settings.json')
    new JsonOrganizationSettings(file).saveName('PRMP')
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
      version: 1,
      organizationName: 'PRMP',
      alertHorizonDays: 15
    })
  })
})

describe('JsonOrganizationSettings — délai d’alerte', () => {
  const file = (): string => join(temp.current.path, 'settings.json')

  it('vaut 15 jours tant que rien n’est enregistré', () => {
    expect(new JsonOrganizationSettings(file()).getAlertHorizonDays()).toBe(15)
  })

  it.each([7, 15, 30, 60])('enregistre %i jours et le relit d’une instance à l’autre', (days) => {
    new JsonOrganizationSettings(file()).saveAlertHorizonDays(days)
    expect(new JsonOrganizationSettings(file()).getAlertHorizonDays()).toBe(days)
  })

  it.each([0, 10, 90, -7, 7.5])('refuse %s sans rien écrire', (days) => {
    const settings = new JsonOrganizationSettings(file())
    expect(() => {
      settings.saveAlertHorizonDays(days)
    }).toThrow()
    expect(existsSync(file())).toBe(false)
  })

  it('le nom et le délai se conservent l’un l’autre', () => {
    const settings = new JsonOrganizationSettings(file())
    settings.saveName('PRMP')
    settings.saveAlertHorizonDays(30)
    settings.saveName('PRMP Fianarantsoa')

    const reloaded = new JsonOrganizationSettings(file())
    expect(reloaded.getName()).toBe('PRMP Fianarantsoa')
    expect(reloaded.getAlertHorizonDays()).toBe(30)

    settings.saveAlertHorizonDays(7)
    expect(new JsonOrganizationSettings(file()).getName()).toBe('PRMP Fianarantsoa')
  })

  it('un fichier écrit avant la Phase 9 (sans délai) reste lisible : nom conservé, délai par défaut', () => {
    writeFileSync(file(), JSON.stringify({ version: 1, organizationName: 'PRMP ancienne' }))
    const settings = new JsonOrganizationSettings(file())
    expect(settings.getName()).toBe('PRMP ancienne')
    expect(settings.getAlertHorizonDays()).toBe(15)
  })

  it('un délai inconnu dans le fichier revient à la valeur par défaut, sans perdre le nom', () => {
    writeFileSync(
      file(),
      JSON.stringify({ version: 1, organizationName: 'PRMP', alertHorizonDays: 45 })
    )
    const settings = new JsonOrganizationSettings(file())
    expect(settings.getAlertHorizonDays()).toBe(15)
    expect(settings.getName()).toBe('PRMP')
  })

  it('un fichier illisible est ignoré : valeurs par défaut', () => {
    writeFileSync(file(), '{ pas du json')
    const settings = new JsonOrganizationSettings(file())
    expect(settings.getName()).toBeNull()
    expect(settings.getAlertHorizonDays()).toBe(15)
  })
})
