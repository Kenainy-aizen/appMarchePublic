import {
  CONTRACT_EVENT_KINDS,
  CONTRACT_KINDS,
  type Contract,
  type ContractEvent,
  createContract,
  createContractEvent
} from '@domain/contract'
import type { ContractRepository } from '@domain/repositories'
import { ariary } from '@domain/shared/ariary'
import { oneOf } from '@domain/shared/text'
import type { SqliteDatabase } from '../database'
import { idsParameter } from '../row-mapping'

interface ContractRow {
  id: string
  reference: string
  kind: string
  procedure_id: string | null
  ppm_line_id: string | null
  holder_id: string
  object: string
  amount: number
  signed_on: string | null
}

interface EventRow {
  id: string
  kind: string
  occurred_on: string
  amount_delta: number | null
  note: string | null
}

export class SqliteContractRepository implements ContractRepository {
  constructor(private readonly db: SqliteDatabase) {}

  save(contract: Contract): void {
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO contract (id, reference, kind, procedure_id, ppm_line_id, holder_id, object, amount, signed_on)
           VALUES (@id, @reference, @kind, @procedureId, @ppmLineId, @holderId, @object, @amount, @signedOn)
           ON CONFLICT (id) DO UPDATE SET
             reference = excluded.reference, kind = excluded.kind, procedure_id = excluded.procedure_id,
             ppm_line_id = excluded.ppm_line_id, holder_id = excluded.holder_id, object = excluded.object,
             amount = excluded.amount, signed_on = excluded.signed_on`
        )
        .run({ ...contract })

      this.db
        .prepare(
          `DELETE FROM contract_event
           WHERE contract_id = ? AND id NOT IN (SELECT value FROM json_each(?))`
        )
        .run(contract.id, idsParameter(contract.events.map((event) => event.id)))

      const upsert = this.db.prepare(
        `INSERT INTO contract_event (id, contract_id, position, kind, occurred_on, amount_delta, note)
         VALUES (@id, @contractId, @position, @kind, @occurredOn, @amountDelta, @note)
         ON CONFLICT (id) DO UPDATE SET
           position = excluded.position, kind = excluded.kind, occurred_on = excluded.occurred_on,
           amount_delta = excluded.amount_delta, note = excluded.note`
      )
      contract.events.forEach((event, position) => {
        upsert.run({ ...event, contractId: contract.id, position })
      })
    })()
  }

  findById(id: string): Contract | null {
    const row = this.db.prepare('SELECT * FROM contract WHERE id = ?').get(id) as
      ContractRow | undefined
    return row ? this.hydrate(row) : null
  }

  list(): readonly Contract[] {
    const rows = this.db.prepare('SELECT * FROM contract ORDER BY reference').all() as ContractRow[]
    return rows.map((row) => this.hydrate(row))
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM contract WHERE id = ?').run(id)
  }

  private hydrate(row: ContractRow): Contract {
    const eventRows = this.db
      .prepare(
        'SELECT id, kind, occurred_on, amount_delta, note FROM contract_event WHERE contract_id = ? ORDER BY position'
      )
      .all(row.id) as EventRow[]

    const events: ContractEvent[] = eventRows.map((eventRow) =>
      createContractEvent({
        id: eventRow.id,
        kind: oneOf(eventRow.kind, CONTRACT_EVENT_KINDS, 'type d’événement'),
        occurredOn: eventRow.occurred_on,
        amountDelta: eventRow.amount_delta,
        note: eventRow.note
      })
    )

    return {
      ...createContract({
        id: row.id,
        reference: row.reference,
        kind: oneOf(row.kind, CONTRACT_KINDS, 'type de contrat'),
        procedureId: row.procedure_id,
        ppmLineId: row.ppm_line_id,
        holderId: row.holder_id,
        object: row.object,
        amount: ariary(row.amount),
        signedOn: row.signed_on
      }),
      events
    }
  }
}
