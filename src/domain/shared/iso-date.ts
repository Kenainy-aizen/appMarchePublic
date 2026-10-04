import { DomainError } from './errors'

declare const isoDateBrand: unique symbol

/** Date calendaire au format AAAA-MM-JJ (sans heure ni fuseau). */
export type IsoDate = string & { readonly [isoDateBrand]: true }

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export function parseIsoDate(value: string): IsoDate {
  const match = ISO_DATE_PATTERN.exec(value)
  if (match) {
    const [, year, month, day] = match
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
    const isReal =
      date.getUTCFullYear() === Number(year) &&
      date.getUTCMonth() === Number(month) - 1 &&
      date.getUTCDate() === Number(day)
    if (isReal) return value as IsoDate
  }
  throw new DomainError('INVALID_DATE', `Date invalide : « ${value} » (format AAAA-MM-JJ attendu).`)
}

export function parseOptionalIsoDate(value: string | null): IsoDate | null {
  return value === null ? null : parseIsoDate(value)
}
