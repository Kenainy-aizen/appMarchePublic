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

const MS_PER_DAY = 24 * 60 * 60 * 1000

const toUtcMs = (date: string): number => {
  const [year, month, day] = date.split('-').map(Number)
  return Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1)
}

/** Nombre de jours entiers de `from` à `to` (négatif si `to` est avant `from`). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY)
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const moved = new Date(toUtcMs(date) + days * MS_PER_DAY)
  const month = String(moved.getUTCMonth() + 1).padStart(2, '0')
  const day = String(moved.getUTCDate()).padStart(2, '0')
  return parseIsoDate(`${String(moved.getUTCFullYear()).padStart(4, '0')}-${month}-${day}`)
}
