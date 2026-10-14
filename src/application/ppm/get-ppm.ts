import type { RegionSession } from '../region-session'
import { requirePpm } from './ppm-access'
import { type PpmDetailView, toDetailView } from './views'

export class GetPpmUseCase {
  constructor(private readonly session: RegionSession) {}

  execute(input: { readonly ppmId: string }): PpmDetailView {
    const { ppms } = this.session.requireWorkspace().repositories
    return toDetailView(requirePpm(ppms, input.ppmId))
  }
}
