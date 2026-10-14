import { describe, expect, it } from 'vitest'
import {
  emptyToNull,
  formatAmount,
  formatAriary,
  formatDate,
  parseAmount,
  splitAccounts
} from '../../src/renderer/src/format'

const normalize = (text: string): string => text.replace(/\s/g, ' ')

describe('formatage', () => {
  it('formate les montants avec le séparateur de milliers français', () => {
    expect(normalize(formatAmount(1_500_000))).toBe('1 500 000')
    expect(normalize(formatAriary(0))).toBe('0 Ar')
    expect(normalize(formatAriary(25_000))).toBe('25 000 Ar')
  })

  it('formate les dates en jour/mois/année, « — » si absente', () => {
    expect(formatDate('2026-10-04')).toBe('04/10/2026')
    expect(formatDate(null)).toBe('—')
  })
})

describe('parseAmount', () => {
  it.each([
    ['1500000', 1_500_000],
    ['1 500 000', 1_500_000],
    ['1\u202f500\u202f000', 1_500_000],
    ['  42  ', 42],
    ['0', 0]
  ])('lit « %s »', (text, expected) => {
    expect(parseAmount(text)).toBe(expected)
  })

  it.each(['', '  ', '12,5', '12.5', '-3', '1e6', 'abc', '12 Ar', '1'.repeat(16)])(
    'refuse « %s »',
    (text) => {
      expect(parseAmount(text)).toBeNull()
    }
  )
})

describe('saisies de texte', () => {
  it('sépare les comptes par virgule ou point-virgule et ignore les vides', () => {
    expect(splitAccounts('6012, 6013 ;6014,, ')).toEqual(['6012', '6013', '6014'])
    expect(splitAccounts('   ')).toEqual([])
  })

  it('transforme un texte vide en null', () => {
    expect(emptyToNull('   ')).toBeNull()
    expect(emptyToNull(' abc ')).toBe('abc')
  })
})
