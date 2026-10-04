import { describe, expect, it } from 'vitest'
import {
  type Ppm,
  addPpmLine,
  createPpm,
  createPpmLine,
  ppmLineTotal,
  ppmTotal,
  recordPpmUpdate
} from '@domain/ppm'
import { ariary } from '@domain/shared/ariary'
import { DomainError } from '@domain/shared/errors'

const newPpm = (): Ppm =>
  createPpm({ id: 'ppm-1', year: 2026, number: 1, elaboratedOn: '2026-01-15' })

describe('createPpm', () => {
  it('crée un plan vide, sans mise à jour', () => {
    const ppm = newPpm()
    expect(ppm.lines).toEqual([])
    expect(ppm.updateCount).toBe(0)
    expect(ppm.lastUpdateOn).toBeNull()
  })

  it.each([1999, 2101, 2026.5])('refuse l’année %s', (year) => {
    expect(() => createPpm({ id: 'x', year, number: 1, elaboratedOn: '2026-01-01' })).toThrow(
      DomainError
    )
  })

  it('refuse un numéro inférieur à 1', () => {
    expect(() => createPpm({ id: 'x', year: 2026, number: 0, elaboratedOn: '2026-01-01' })).toThrow(
      DomainError
    )
  })
})

describe('createPpmLine', () => {
  it('exige un objet', () => {
    expect(() => createPpmLine({ id: 'l1', nature: 'TRAVAUX', object: '   ' })).toThrow(DomainError)
  })

  it('refuse des dates prévisionnelles dans le désordre', () => {
    expect(() =>
      createPpmLine({
        id: 'l1',
        nature: 'FOURNITURES',
        object: 'Achat de matériel',
        plannedLaunchDate: '2026-05-10',
        plannedBidOpeningDate: '2026-04-01'
      })
    ).toThrow(DomainError)
  })

  it('accepte des dates partielles et ordonnées', () => {
    const line = createPpmLine({
      id: 'l1',
      nature: 'SERVICES',
      object: 'Gardiennage',
      plannedLaunchDate: '2026-03-01',
      plannedAwardDate: '2026-04-15'
    })
    expect(line.plannedBidOpeningDate).toBeNull()
  })

  it('nettoie les textes et sépare les comptes', () => {
    const line = createPpmLine({
      id: 'l1',
      nature: 'TRAVAUX',
      object: '  Réhabilitation du bureau  ',
      financing: '  ',
      accounts: ['6012', '6013']
    })
    expect(line.object).toBe('Réhabilitation du bureau')
    expect(line.financing).toBeNull()
    expect(line.accounts).toEqual(['6012', '6013'])
  })
})

describe('totaux et mises à jour', () => {
  it('somme les services bénéficiaires par ligne puis pour le plan', () => {
    const lineA = createPpmLine({
      id: 'a',
      nature: 'TRAVAUX',
      object: 'A',
      beneficiaries: [
        { service: 'SRH', amount: ariary(1_000) },
        { service: 'SAF', amount: ariary(500) }
      ]
    })
    const lineB = createPpmLine({
      id: 'b',
      nature: 'SERVICES',
      object: 'B',
      beneficiaries: [{ service: 'SRH', amount: ariary(2_000) }]
    })
    const ppm = addPpmLine(addPpmLine(newPpm(), lineA), lineB)

    expect(ppmLineTotal(lineA)).toBe(1_500)
    expect(ppmTotal(ppm)).toBe(3_500)
  })

  it('refuse deux lignes avec le même identifiant', () => {
    const line = createPpmLine({ id: 'a', nature: 'TRAVAUX', object: 'A' })
    expect(() => addPpmLine(addPpmLine(newPpm(), line), line)).toThrow(DomainError)
  })

  it('incrémente le compteur de mise à jour sans modifier l’original', () => {
    const original = newPpm()
    const updated = recordPpmUpdate(recordPpmUpdate(original, '2026-02-01'), '2026-03-01')

    expect(updated.updateCount).toBe(2)
    expect(updated.lastUpdateOn).toBe('2026-03-01')
    expect(original.updateCount).toBe(0)
  })
})
