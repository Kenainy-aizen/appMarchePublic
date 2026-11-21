import { describe, expect, it } from 'vitest'
import { ALERT_HORIZON_CHOICES as DOMAIN_CHOICES } from '@domain/alerts'
import { ALERT_HORIZON_CHOICES, ALERT_HORIZON_LABELS } from '@shared/alert-options'

/** Les délais proposés par l'interface ne doivent jamais dériver de ceux du domaine. */
describe('délais d’alerte (interface / domaine)', () => {
  it('sont identiques et dans le même ordre', () => {
    expect([...ALERT_HORIZON_CHOICES]).toEqual([...DOMAIN_CHOICES])
  })

  it('ont chacun un libellé en jours', () => {
    for (const days of ALERT_HORIZON_CHOICES)
      expect(ALERT_HORIZON_LABELS[days]).toBe(`${String(days)} jours`)
  })
})
