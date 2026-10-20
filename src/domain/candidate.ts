import { optionalText, requiredText } from './shared/text'

/** NIF comparé sans espaces ni différence de casse (« 123 456 » = « 123456 »). */
export function normalizeNif(nif: string): string {
  return nif.replace(/\s+/g, '').toUpperCase()
}

/** Candidat / soumissionnaire / titulaire, partagé entre procédures et contrats. */
export interface Candidate {
  readonly id: string
  readonly name: string
  readonly nif: string | null
  readonly stat: string | null
  readonly address: string | null
  readonly phone: string | null
  readonly email: string | null
}

export interface CandidateInput {
  readonly id: string
  readonly name: string
  readonly nif?: string | null
  readonly stat?: string | null
  readonly address?: string | null
  readonly phone?: string | null
  readonly email?: string | null
}

export function createCandidate(input: CandidateInput): Candidate {
  return {
    id: requiredText(input.id, 'identifiant'),
    name: requiredText(input.name, 'nom du candidat'),
    nif: optionalText(input.nif ?? null),
    stat: optionalText(input.stat ?? null),
    address: optionalText(input.address ?? null),
    phone: optionalText(input.phone ?? null),
    email: optionalText(input.email ?? null)
  }
}
