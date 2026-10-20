import { parseStepKind, reopenStep, setStepDates, validateStep } from '@domain/procedure'
import type { Clock } from '@domain/shared/ports'
import type { RegionSession } from '../region-session'
import { detailOf, requireProcedure } from './procedure-access'
import type { ProcedureDetailView } from './views'

/** Charge la procédure, applique une règle du domaine, enregistre et renvoie la vue mise à jour. */
function applyToProcedure(
  session: RegionSession,
  procedureId: string,
  change: (procedure: ReturnType<typeof requireProcedure>) => ReturnType<typeof requireProcedure>
): ProcedureDetailView {
  const { repositories } = session.requireWorkspace()
  const updated = change(requireProcedure(repositories.procedures, procedureId))
  repositories.procedures.save(updated)
  return detailOf(repositories, updated)
}

export class SaveStepDatesUseCase {
  constructor(private readonly session: RegionSession) {}

  execute(input: {
    readonly procedureId: string
    readonly step: string
    readonly plannedDate: string | null
    readonly actualDate: string | null
  }): ProcedureDetailView {
    return applyToProcedure(this.session, input.procedureId, (procedure) =>
      setStepDates(procedure, parseStepKind(input.step), {
        plannedDate: input.plannedDate,
        actualDate: input.actualDate
      })
    )
  }
}

/** Valide une étape à la date du jour (ADR-027 : la précédente doit l'être, date réelle obligatoire). */
export class ValidateStepUseCase {
  constructor(
    private readonly session: RegionSession,
    private readonly clock: Clock
  ) {}

  execute(input: { readonly procedureId: string; readonly step: string }): ProcedureDetailView {
    return applyToProcedure(this.session, input.procedureId, (procedure) =>
      validateStep(procedure, parseStepKind(input.step), this.clock.today())
    )
  }
}

export class ReopenStepUseCase {
  constructor(private readonly session: RegionSession) {}

  execute(input: { readonly procedureId: string; readonly step: string }): ProcedureDetailView {
    return applyToProcedure(this.session, input.procedureId, (procedure) =>
      reopenStep(procedure, parseStepKind(input.step))
    )
  }
}
