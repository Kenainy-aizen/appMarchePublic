import { createPpm } from '@domain/ppm'
import type { Clock, IdGenerator } from '@domain/shared/ports'
import type { RegionSession } from '../region-session'
import { type PpmDetailView, toDetailView } from './views'

export interface CreatePpmInput {
  readonly year: number
  /** Date d'élaboration (AAAA-MM-JJ) ; aujourd'hui si elle n'est pas fournie. */
  readonly elaboratedOn: string | null
}

/** Crée un plan vide. Le numéro est attribué automatiquement : 1, 2, 3… au sein de l'année. */
export class CreatePpmUseCase {
  constructor(
    private readonly session: RegionSession,
    private readonly ids: IdGenerator,
    private readonly clock: Clock
  ) {}

  execute(input: CreatePpmInput): PpmDetailView {
    const { ppms } = this.session.requireWorkspace().repositories
    const ppm = createPpm({
      id: this.ids.newId(),
      year: input.year,
      number: ppms.nextNumber(input.year),
      elaboratedOn: input.elaboratedOn ?? this.clock.today()
    })
    ppms.save(ppm)
    return toDetailView(ppm)
  }
}
