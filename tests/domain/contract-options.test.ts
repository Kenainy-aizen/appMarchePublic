import { describe, expect, it } from 'vitest'
import {
  CONTRACT_EVENT_KINDS,
  CONTRACT_EVENT_LABELS as DOMAIN_EVENT_LABELS,
  CONTRACT_KIND_LABELS as DOMAIN_KIND_LABELS,
  CONTRACT_KINDS,
  CONTRACT_STATUS_LABELS as DOMAIN_STATUS_LABELS
} from '@domain/contract'
import {
  CONTRACT_EVENT_CODES,
  CONTRACT_EVENT_LABELS,
  CONTRACT_KIND_CODES,
  CONTRACT_KIND_LABELS,
  CONTRACT_STATUS_CODES,
  CONTRACT_STATUS_LABELS
} from '@shared/contract-options'

/** Les listes et libellés de l'interface ne doivent jamais dériver de ceux du domaine. */
describe('options des contrats (interface / domaine)', () => {
  it('les types de contrat sont identiques', () => {
    expect([...CONTRACT_KIND_CODES]).toEqual([...CONTRACTS_KINDS()])
    expect(CONTRACT_KIND_LABELS).toEqual(DOMAIN_KIND_LABELS)
  })

  it('les événements d’exécution sont identiques et dans le même ordre', () => {
    expect([...CONTRACT_EVENT_CODES]).toEqual([...CONTRACT_EVENT_KINDS])
    expect(CONTRACT_EVENT_LABELS).toEqual(DOMAIN_EVENT_LABELS)
  })

  it('les situations ont les mêmes libellés', () => {
    expect(CONTRACT_STATUS_LABELS).toEqual(DOMAIN_STATUS_LABELS)
    expect(Object.keys(DOMAIN_STATUS_LABELS)).toEqual([...CONTRACT_STATUS_CODES])
  })
})

function CONTRACTS_KINDS(): readonly string[] {
  return CONTRACT_KINDS
}
