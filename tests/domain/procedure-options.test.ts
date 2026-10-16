import { describe, expect, it } from 'vitest'
import { STEP_KINDS, STEP_LABELS as DOMAIN_STEP_LABELS } from '@domain/procedure'
import { STATUS_CODES, STATUS_LABELS, STEP_CODES, STEP_LABELS } from '@shared/procedure-options'

/** Les étapes et libellés de l'interface ne doivent jamais dériver de ceux du domaine. */
describe('options des procédures (interface / domaine)', () => {
  it('les étapes sont identiques et dans le même ordre', () => {
    expect([...STEP_CODES]).toEqual([...STEP_KINDS])
  })

  it('les libellés d’étapes sont identiques', () => {
    expect(STEP_LABELS).toEqual(DOMAIN_STEP_LABELS)
  })

  it('chaque statut a un libellé français', () => {
    for (const code of STATUS_CODES) expect(STATUS_LABELS[code].length).toBeGreaterThan(0)
  })
})
