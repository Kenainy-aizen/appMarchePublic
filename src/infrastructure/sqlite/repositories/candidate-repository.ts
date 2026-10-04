import { type Candidate, createCandidate } from '@domain/candidate'
import type { CandidateRepository } from '@domain/repositories'
import type { SqliteDatabase } from '../database'

interface CandidateRow {
  id: string
  name: string
  nif: string | null
  stat: string | null
  address: string | null
  phone: string | null
  email: string | null
}

export class SqliteCandidateRepository implements CandidateRepository {
  constructor(private readonly db: SqliteDatabase) {}

  save(candidate: Candidate): void {
    this.db
      .prepare(
        `INSERT INTO candidate (id, name, nif, stat, address, phone, email)
         VALUES (@id, @name, @nif, @stat, @address, @phone, @email)
         ON CONFLICT (id) DO UPDATE SET
           name = excluded.name, nif = excluded.nif, stat = excluded.stat,
           address = excluded.address, phone = excluded.phone, email = excluded.email`
      )
      .run({ ...candidate })
  }

  findById(id: string): Candidate | null {
    const row = this.db.prepare('SELECT * FROM candidate WHERE id = ?').get(id) as
      CandidateRow | undefined
    return row ? toCandidate(row) : null
  }

  list(): readonly Candidate[] {
    const rows = this.db
      .prepare('SELECT * FROM candidate ORDER BY name COLLATE NOCASE')
      .all() as CandidateRow[]
    return rows.map(toCandidate)
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM candidate WHERE id = ?').run(id)
  }
}

function toCandidate(row: CandidateRow): Candidate {
  return createCandidate(row)
}
