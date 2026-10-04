import { createPpm, createPpmLine, type Ppm, type PpmLine, PROCUREMENT_NATURES } from '@domain/ppm'
import { PROCEDURE_METHODS } from '@domain/procedure'
import type { PpmRepository } from '@domain/repositories'
import { ariary } from '@domain/shared/ariary'
import { parseOptionalIsoDate } from '@domain/shared/iso-date'
import { oneOf } from '@domain/shared/text'
import type { SqliteDatabase } from '../database'
import { idsParameter, parseStringArray } from '../row-mapping'

interface PpmRow {
  id: string
  year: number
  number: number
  elaborated_on: string
  last_update_on: string | null
  update_count: number
}

interface LineRow {
  id: string
  nature: string
  object: string
  financing: string | null
  accounts: string
  planned_launch_date: string | null
  planned_bid_opening_date: string | null
  planned_award_date: string | null
  method: string | null
  procedure_lead: string | null
}

interface BeneficiaryRow {
  service: string
  amount: number
}

export class SqlitePpmRepository implements PpmRepository {
  constructor(private readonly db: SqliteDatabase) {}

  nextNumber(year: number): number {
    const row = this.db
      .prepare('SELECT COALESCE(MAX(number), 0) + 1 AS next FROM ppm WHERE year = ?')
      .get(year) as { next: number }
    return row.next
  }

  /**
   * Enregistre le plan en entier. Les lignes sont mises à jour sur place (jamais supprimées puis
   * recréées) pour ne pas casser les procédures et contrats qui y font référence.
   */
  save(ppm: Ppm): void {
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO ppm (id, year, number, elaborated_on, last_update_on, update_count)
           VALUES (@id, @year, @number, @elaboratedOn, @lastUpdateOn, @updateCount)
           ON CONFLICT (id) DO UPDATE SET
             year = excluded.year, number = excluded.number, elaborated_on = excluded.elaborated_on,
             last_update_on = excluded.last_update_on, update_count = excluded.update_count`
        )
        .run({ ...ppm })

      this.db
        .prepare(
          `DELETE FROM ppm_line
           WHERE ppm_id = ? AND id NOT IN (SELECT value FROM json_each(?))`
        )
        .run(ppm.id, idsParameter(ppm.lines.map((line) => line.id)))

      ppm.lines.forEach((line, position) => {
        this.saveLine(ppm.id, line, position)
      })
    })()
  }

  findById(id: string): Ppm | null {
    const row = this.db.prepare('SELECT * FROM ppm WHERE id = ?').get(id) as PpmRow | undefined
    return row ? this.hydrate(row) : null
  }

  list(): readonly Ppm[] {
    const rows = this.db
      .prepare('SELECT * FROM ppm ORDER BY year DESC, number DESC')
      .all() as PpmRow[]
    return rows.map((row) => this.hydrate(row))
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM ppm WHERE id = ?').run(id)
  }

  private saveLine(ppmId: string, line: PpmLine, position: number): void {
    this.db
      .prepare(
        `INSERT INTO ppm_line (
           id, ppm_id, position, nature, object, financing, accounts,
           planned_launch_date, planned_bid_opening_date, planned_award_date, method, procedure_lead
         ) VALUES (
           @id, @ppmId, @position, @nature, @object, @financing, @accounts,
           @plannedLaunchDate, @plannedBidOpeningDate, @plannedAwardDate, @method, @procedureLead
         )
         ON CONFLICT (id) DO UPDATE SET
           ppm_id = excluded.ppm_id, position = excluded.position, nature = excluded.nature,
           object = excluded.object, financing = excluded.financing, accounts = excluded.accounts,
           planned_launch_date = excluded.planned_launch_date,
           planned_bid_opening_date = excluded.planned_bid_opening_date,
           planned_award_date = excluded.planned_award_date,
           method = excluded.method, procedure_lead = excluded.procedure_lead`
      )
      .run({ ...line, ppmId, position, accounts: JSON.stringify(line.accounts) })

    this.db.prepare('DELETE FROM ppm_line_beneficiary WHERE line_id = ?').run(line.id)
    const insertBeneficiary = this.db.prepare(
      'INSERT INTO ppm_line_beneficiary (line_id, position, service, amount) VALUES (?, ?, ?, ?)'
    )
    line.beneficiaries.forEach((beneficiary, index) => {
      insertBeneficiary.run(line.id, index, beneficiary.service, beneficiary.amount)
    })
  }

  private hydrate(row: PpmRow): Ppm {
    const lineRows = this.db
      .prepare('SELECT * FROM ppm_line WHERE ppm_id = ? ORDER BY position')
      .all(row.id) as LineRow[]

    return {
      ...createPpm({
        id: row.id,
        year: row.year,
        number: row.number,
        elaboratedOn: row.elaborated_on
      }),
      lastUpdateOn: parseOptionalIsoDate(row.last_update_on),
      updateCount: row.update_count,
      lines: lineRows.map((lineRow) => this.hydrateLine(lineRow))
    }
  }

  private hydrateLine(row: LineRow): PpmLine {
    const beneficiaries = this.db
      .prepare(
        'SELECT service, amount FROM ppm_line_beneficiary WHERE line_id = ? ORDER BY position'
      )
      .all(row.id) as BeneficiaryRow[]

    return createPpmLine({
      id: row.id,
      nature: oneOf(row.nature, PROCUREMENT_NATURES, 'nature du marché'),
      object: row.object,
      financing: row.financing,
      accounts: parseStringArray(row.accounts, 'comptes'),
      plannedLaunchDate: row.planned_launch_date,
      plannedBidOpeningDate: row.planned_bid_opening_date,
      plannedAwardDate: row.planned_award_date,
      beneficiaries: beneficiaries.map((beneficiary) => ({
        service: beneficiary.service,
        amount: ariary(beneficiary.amount)
      })),
      method:
        row.method === null ? null : oneOf(row.method, PROCEDURE_METHODS, 'mode de passation'),
      procedureLead: row.procedure_lead
    })
  }
}
