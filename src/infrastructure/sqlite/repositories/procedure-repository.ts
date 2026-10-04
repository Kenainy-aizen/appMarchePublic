import {
  createBid,
  createProcedure,
  createStep,
  PROCEDURE_METHODS,
  type Procedure,
  STEP_KINDS,
  type Bid,
  type ProcedureStep
} from '@domain/procedure'
import type { ProcedureRepository } from '@domain/repositories'
import { ariary } from '@domain/shared/ariary'
import { oneOf } from '@domain/shared/text'
import type { SqliteDatabase } from '../database'
import { idsParameter } from '../row-mapping'

interface ProcedureRow {
  id: string
  reference: string
  object: string
  method: string
  ppm_line_id: string | null
  estimated_amount: number | null
  created_on: string
}

interface StepRow {
  kind: string
  planned_date: string | null
  actual_date: string | null
  validated_on: string | null
}

interface BidRow {
  id: string
  candidate_id: string
  amount: number
  awarded: number
}

export class SqliteProcedureRepository implements ProcedureRepository {
  constructor(private readonly db: SqliteDatabase) {}

  save(procedure: Procedure): void {
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO procedure (id, reference, object, method, ppm_line_id, estimated_amount, created_on)
           VALUES (@id, @reference, @object, @method, @ppmLineId, @estimatedAmount, @createdOn)
           ON CONFLICT (id) DO UPDATE SET
             reference = excluded.reference, object = excluded.object, method = excluded.method,
             ppm_line_id = excluded.ppm_line_id, estimated_amount = excluded.estimated_amount,
             created_on = excluded.created_on`
        )
        .run({ ...procedure })

      this.saveSteps(procedure)
      this.saveBids(procedure)
    })()
  }

  findById(id: string): Procedure | null {
    const row = this.db.prepare('SELECT * FROM procedure WHERE id = ?').get(id) as
      ProcedureRow | undefined
    return row ? this.hydrate(row) : null
  }

  list(): readonly Procedure[] {
    const rows = this.db
      .prepare('SELECT * FROM procedure ORDER BY created_on DESC, reference')
      .all() as ProcedureRow[]
    return rows.map((row) => this.hydrate(row))
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM procedure WHERE id = ?').run(id)
  }

  private saveSteps(procedure: Procedure): void {
    this.db
      .prepare(
        `DELETE FROM procedure_step
         WHERE procedure_id = ? AND kind NOT IN (SELECT value FROM json_each(?))`
      )
      .run(procedure.id, idsParameter(procedure.steps.map((step) => step.kind)))

    const upsert = this.db.prepare(
      `INSERT INTO procedure_step (procedure_id, kind, planned_date, actual_date, validated_on)
       VALUES (@procedureId, @kind, @plannedDate, @actualDate, @validatedOn)
       ON CONFLICT (procedure_id, kind) DO UPDATE SET
         planned_date = excluded.planned_date, actual_date = excluded.actual_date,
         validated_on = excluded.validated_on`
    )
    for (const step of procedure.steps) upsert.run({ ...step, procedureId: procedure.id })
  }

  private saveBids(procedure: Procedure): void {
    this.db
      .prepare(
        `DELETE FROM bid WHERE procedure_id = ? AND id NOT IN (SELECT value FROM json_each(?))`
      )
      .run(procedure.id, idsParameter(procedure.bids.map((bid) => bid.id)))

    // On retire d'abord le statut « retenue » : l'index n'autorise qu'une seule offre retenue.
    this.db.prepare('UPDATE bid SET awarded = 0 WHERE procedure_id = ?').run(procedure.id)

    const upsert = this.db.prepare(
      `INSERT INTO bid (id, procedure_id, candidate_id, amount, awarded)
       VALUES (@id, @procedureId, @candidateId, @amount, @awarded)
       ON CONFLICT (id) DO UPDATE SET
         candidate_id = excluded.candidate_id, amount = excluded.amount, awarded = excluded.awarded`
    )
    for (const bid of procedure.bids) {
      upsert.run({ ...bid, procedureId: procedure.id, awarded: bid.awarded ? 1 : 0 })
    }
  }

  private hydrate(row: ProcedureRow): Procedure {
    const stepRows = this.db
      .prepare(
        'SELECT kind, planned_date, actual_date, validated_on FROM procedure_step WHERE procedure_id = ?'
      )
      .all(row.id) as StepRow[]
    const bidRows = this.db
      .prepare(
        'SELECT id, candidate_id, amount, awarded FROM bid WHERE procedure_id = ? ORDER BY rowid'
      )
      .all(row.id) as BidRow[]

    const steps: ProcedureStep[] = stepRows
      .map((stepRow) =>
        createStep({
          kind: oneOf(stepRow.kind, STEP_KINDS, 'étape'),
          plannedDate: stepRow.planned_date,
          actualDate: stepRow.actual_date,
          validatedOn: stepRow.validated_on
        })
      )
      .sort((a, b) => STEP_KINDS.indexOf(a.kind) - STEP_KINDS.indexOf(b.kind))

    const bids: Bid[] = bidRows.map((bidRow) =>
      createBid({
        id: bidRow.id,
        candidateId: bidRow.candidate_id,
        amount: ariary(bidRow.amount),
        awarded: bidRow.awarded === 1
      })
    )

    return {
      ...createProcedure({
        id: row.id,
        reference: row.reference,
        object: row.object,
        method: oneOf(row.method, PROCEDURE_METHODS, 'mode de passation'),
        ppmLineId: row.ppm_line_id,
        estimatedAmount: row.estimated_amount === null ? null : ariary(row.estimated_amount),
        createdOn: row.created_on
      }),
      steps,
      bids
    }
  }
}
