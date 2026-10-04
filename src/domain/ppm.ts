import { type Ariary, sumAriary } from './shared/ariary'
import { DomainError } from './shared/errors'
import { type IsoDate, parseIsoDate } from './shared/iso-date'
import { optionalText, requiredText } from './shared/text'
import { type ProcedureMethod } from './procedure'

export const PROCUREMENT_NATURES = [
  'TRAVAUX',
  'FOURNITURES',
  'SERVICES',
  'PRESTATIONS_INTELLECTUELLES'
] as const
export type ProcurementNature = (typeof PROCUREMENT_NATURES)[number]

/** Service bénéficiaire (SOA) et la part du montant qui lui revient. */
export interface Beneficiary {
  readonly service: string
  readonly amount: Ariary
}

/** Ligne (détail) d'un plan de passation. */
export interface PpmLine {
  readonly id: string
  readonly nature: ProcurementNature
  readonly object: string
  readonly financing: string | null
  readonly accounts: readonly string[]
  readonly plannedLaunchDate: IsoDate | null
  readonly plannedBidOpeningDate: IsoDate | null
  readonly plannedAwardDate: IsoDate | null
  readonly beneficiaries: readonly Beneficiary[]
  readonly method: ProcedureMethod | null
  readonly procedureLead: string | null
}

/** Plan de passation des marchés (entête + lignes). */
export interface Ppm {
  readonly id: string
  readonly year: number
  readonly number: number
  readonly elaboratedOn: IsoDate
  readonly lastUpdateOn: IsoDate | null
  readonly updateCount: number
  readonly lines: readonly PpmLine[]
}

export interface PpmInput {
  readonly id: string
  readonly year: number
  readonly number: number
  readonly elaboratedOn: string
}

export function createPpm(input: PpmInput): Ppm {
  if (!Number.isInteger(input.year) || input.year < 2000 || input.year > 2100) {
    throw new DomainError('INVALID_YEAR', `Année invalide : ${input.year}.`)
  }
  if (!Number.isInteger(input.number) || input.number < 1) {
    throw new DomainError('INVALID_NUMBER', `Numéro de PPM invalide : ${input.number}.`)
  }
  return {
    id: requiredText(input.id, 'identifiant'),
    year: input.year,
    number: input.number,
    elaboratedOn: parseIsoDate(input.elaboratedOn),
    lastUpdateOn: null,
    updateCount: 0,
    lines: []
  }
}

export interface PpmLineInput {
  readonly id: string
  readonly nature: ProcurementNature
  readonly object: string
  readonly financing?: string | null
  readonly accounts?: readonly string[]
  readonly plannedLaunchDate?: string | null
  readonly plannedBidOpeningDate?: string | null
  readonly plannedAwardDate?: string | null
  readonly beneficiaries?: readonly Beneficiary[]
  readonly method?: ProcedureMethod | null
  readonly procedureLead?: string | null
}

export function createPpmLine(input: PpmLineInput): PpmLine {
  const launch = input.plannedLaunchDate ? parseIsoDate(input.plannedLaunchDate) : null
  const opening = input.plannedBidOpeningDate ? parseIsoDate(input.plannedBidOpeningDate) : null
  const award = input.plannedAwardDate ? parseIsoDate(input.plannedAwardDate) : null
  assertChronological([launch, opening, award])

  return {
    id: requiredText(input.id, 'identifiant'),
    nature: input.nature,
    object: requiredText(input.object, 'objet'),
    financing: optionalText(input.financing ?? null),
    accounts: (input.accounts ?? []).map((account) => requiredText(account, 'compte')),
    plannedLaunchDate: launch,
    plannedBidOpeningDate: opening,
    plannedAwardDate: award,
    beneficiaries: (input.beneficiaries ?? []).map((beneficiary) => ({
      service: requiredText(beneficiary.service, 'service bénéficiaire'),
      amount: beneficiary.amount
    })),
    method: input.method ?? null,
    procedureLead: optionalText(input.procedureLead ?? null)
  }
}

/** Les dates prévisionnelles renseignées doivent se suivre : lancement ≤ ouverture ≤ attribution. */
function assertChronological(dates: readonly (IsoDate | null)[]): void {
  const present = dates.filter((date): date is IsoDate => date !== null)
  for (let index = 1; index < present.length; index += 1) {
    const previous = present[index - 1]
    const current = present[index]
    if (previous !== undefined && current !== undefined && current < previous) {
      throw new DomainError(
        'INCONSISTENT_PLANNED_DATES',
        'Les dates prévisionnelles doivent suivre l’ordre : lancement, ouverture des plis, attribution.'
      )
    }
  }
}

/** Montant total d'une ligne = somme des montants des services bénéficiaires. */
export function ppmLineTotal(line: PpmLine): Ariary {
  return sumAriary(line.beneficiaries.map((beneficiary) => beneficiary.amount))
}

/** Montant total du plan. */
export function ppmTotal(ppm: Ppm): Ariary {
  return sumAriary(ppm.lines.map(ppmLineTotal))
}

/** Enregistre une mise à jour de l'entête : date de dernière mise à jour et compteur incrémenté. */
export function recordPpmUpdate(ppm: Ppm, updatedOn: string): Ppm {
  return { ...ppm, lastUpdateOn: parseIsoDate(updatedOn), updateCount: ppm.updateCount + 1 }
}

export function addPpmLine(ppm: Ppm, line: PpmLine): Ppm {
  if (ppm.lines.some((existing) => existing.id === line.id)) {
    throw new DomainError('DUPLICATE_LINE', 'Cette ligne existe déjà dans le plan.')
  }
  return { ...ppm, lines: [...ppm.lines, line] }
}
