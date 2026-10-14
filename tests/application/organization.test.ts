import { beforeEach, describe, expect, it } from 'vitest'
import { SaveOrganizationUseCase } from '@application/organization/save-organization'
import { ListRegionsUseCase } from '@application/regions/list-regions'
import { DomainError } from '@domain/shared/errors'
import { InMemoryOrganizationSettings, InMemoryRegistry } from './fakes'

let settings: InMemoryOrganizationSettings
let save: SaveOrganizationUseCase
let list: ListRegionsUseCase

beforeEach(() => {
  settings = new InMemoryOrganizationSettings()
  save = new SaveOrganizationUseCase(settings)
  list = new ListRegionsUseCase(new InMemoryRegistry(), settings)
})

describe('nom de la PRMP', () => {
  it('est absent au premier lancement, puis présent dans la vue d’ensemble', () => {
    expect(list.execute().organizationName).toBeNull()

    expect(save.execute({ name: '  PRMP   Fianarantsoa ' })).toEqual({ name: 'PRMP Fianarantsoa' })

    expect(list.execute().organizationName).toBe('PRMP Fianarantsoa')
  })

  it('se corrige : la nouvelle valeur remplace l’ancienne', () => {
    save.execute({ name: 'PRMP Fianarantsoa' })
    save.execute({ name: 'PRMP du Ministère de l’Environnement' })
    expect(list.execute().organizationName).toBe('PRMP du Ministère de l’Environnement')
  })

  it('refuse un nom vide ou trop long sans modifier le nom existant', () => {
    save.execute({ name: 'PRMP Fianarantsoa' })

    expect(() => save.execute({ name: '   ' })).toThrow(DomainError)
    expect(() => save.execute({ name: 'x'.repeat(500) })).toThrow(DomainError)

    expect(list.execute().organizationName).toBe('PRMP Fianarantsoa')
  })

  it('ne dépend d’aucune région ouverte', () => {
    expect(() => save.execute({ name: 'PRMP' })).not.toThrow()
  })
})
