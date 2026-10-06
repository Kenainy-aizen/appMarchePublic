import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { RegisteredRegion } from '@application/ports'
import { JsonRegionRegistry, RegistryCorruptedError } from '@infrastructure/json-region-registry'
import { ScryptRegionKeyService } from '@infrastructure/crypto/scrypt-key-service'
import { createTempDirectory } from './helpers'

const temp = { current: createTempDirectory() }
const keys = new ScryptRegionKeyService({ n: 1024, r: 8, p: 1 })

const makeRegion = async (id: string, name: string): Promise<RegisteredRegion> => {
  const { secrets } = await keys.createSecrets(id, 'phrase de passe très longue')
  return { id, name, createdOn: '2026-10-04', secrets }
}

beforeEach(() => {
  temp.current = createTempDirectory()
})
afterEach(() => {
  temp.current.cleanup()
})

describe('JsonRegionRegistry', () => {
  it('est vide tant que le fichier n’existe pas', () => {
    expect(new JsonRegionRegistry(join(temp.current.path, 'regions.json')).list()).toEqual([])
  })

  it('conserve les régions d’une instance à l’autre (redémarrage)', async () => {
    const file = join(temp.current.path, 'sous-dossier', 'regions.json')
    const region = await makeRegion('11111111-1111-4111-8111-111111111111', 'Région 1')
    new JsonRegionRegistry(file).add(region)

    const reloaded = new JsonRegionRegistry(file)
    expect(reloaded.list()).toEqual([region])
    expect(reloaded.find(region.id)).toEqual(region)
    expect(reloaded.find('inconnue')).toBeNull()
    expect(existsSync(`${file}.tmp`)).toBe(false)
  })

  it('refuse d’ajouter deux fois la même région', async () => {
    const registry = new JsonRegionRegistry(join(temp.current.path, 'regions.json'))
    const region = await makeRegion('11111111-1111-4111-8111-111111111111', 'Région 1')
    registry.add(region)

    expect(() => {
      registry.add(region)
    }).toThrow()
  })

  it.each([
    ['du JSON invalide', '{ pas du json'],
    ['une structure inattendue', JSON.stringify({ version: 1, regions: [{ id: 'x' }] })],
    ['une version inconnue', JSON.stringify({ version: 2, regions: [] })]
  ])('signale clairement un fichier avec %s', (_label, content) => {
    const file = join(temp.current.path, 'regions.json')
    writeFileSync(file, content)

    expect(() => new JsonRegionRegistry(file).list()).toThrow(RegistryCorruptedError)
  })

  it('ne contient aucun mot de passe ni clé en clair dans le fichier', async () => {
    const file = join(temp.current.path, 'regions.json')
    const { secrets, dataKey, recoveryKey } = await keys.createSecrets(
      '11111111-1111-4111-8111-111111111111',
      'phrase de passe très longue'
    )
    new JsonRegionRegistry(file).add({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Région 1',
      createdOn: '2026-10-04',
      secrets
    })

    const content = readFileSync(file, 'utf8')
    for (const secret of [
      'phrase de passe très longue',
      recoveryKey,
      dataKey.toString('base64'),
      dataKey.toString('hex')
    ]) {
      expect(content.includes(secret)).toBe(false)
    }
  })
})
