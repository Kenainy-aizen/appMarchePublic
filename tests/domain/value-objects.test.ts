import { describe, expect, it } from 'vitest'
import { ariary, sumAriary } from '@domain/shared/ariary'
import { DomainError } from '@domain/shared/errors'
import { parseIsoDate } from '@domain/shared/iso-date'

describe('ariary', () => {
  it('accepte un entier positif ou nul', () => {
    expect(ariary(0)).toBe(0)
    expect(ariary(1_500_000)).toBe(1_500_000)
  })

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('refuse %s', (value) => {
    expect(() => ariary(value)).toThrow(DomainError)
  })

  it('additionne des montants', () => {
    expect(sumAriary([ariary(100), ariary(250)])).toBe(350)
    expect(sumAriary([])).toBe(0)
  })
})

describe('parseIsoDate', () => {
  it('accepte une date réelle', () => {
    expect(parseIsoDate('2026-10-04')).toBe('2026-10-04')
    expect(parseIsoDate('2028-02-29')).toBe('2028-02-29')
  })

  it.each(['2026-02-30', '2026-13-01', '04/10/2026', '2026-1-1', ''])('refuse « %s »', (value) => {
    expect(() => parseIsoDate(value)).toThrow(DomainError)
  })
})
