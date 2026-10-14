import { describe, expect, it } from 'vitest'
import { PROCUREMENT_NATURES } from '@domain/ppm'
import { PROCEDURE_METHODS } from '@domain/procedure'
import { METHOD_CODES, METHOD_LABELS, NATURE_CODES, NATURE_LABELS } from '@shared/ppm-options'

/** Les listes de l'interface ne doivent jamais dériver de celles du domaine. */
describe('options du plan de passation (interface / domaine)', () => {
  it('les natures sont identiques', () => {
    expect([...NATURE_CODES]).toEqual([...PROCUREMENT_NATURES])
  })

  it('les modes de passation sont identiques', () => {
    expect([...METHOD_CODES]).toEqual([...PROCEDURE_METHODS])
  })

  it('chaque code a un libellé français non vide', () => {
    for (const code of NATURE_CODES) expect(NATURE_LABELS[code].length).toBeGreaterThan(0)
    for (const code of METHOD_CODES) expect(METHOD_LABELS[code].length).toBeGreaterThan(0)
  })
})
