import {
  type Attachment,
  type AttachmentOwnerKind,
  ATTACHMENT_OWNER_KINDS,
  createAttachment
} from '@domain/attachment'
import type { AttachmentRepository } from '@domain/repositories'
import { oneOf } from '@domain/shared/text'
import type { SqliteDatabase } from '../database'

interface AttachmentRow {
  id: string
  owner_kind: string
  owner_id: string
  name: string
  mime_type: string
  size: number
  added_on: string
  note: string | null
}

export class SqliteAttachmentRepository implements AttachmentRepository {
  constructor(private readonly db: SqliteDatabase) {}

  save(attachment: Attachment): void {
    this.db
      .prepare(
        `INSERT INTO attachment (id, owner_kind, owner_id, name, mime_type, size, added_on, note)
         VALUES (@id, @ownerKind, @ownerId, @name, @mimeType, @size, @addedOn, @note)
         ON CONFLICT (id) DO UPDATE SET
           owner_kind = excluded.owner_kind, owner_id = excluded.owner_id, name = excluded.name,
           mime_type = excluded.mime_type, size = excluded.size, added_on = excluded.added_on,
           note = excluded.note`
      )
      .run({ ...attachment })
  }

  findById(id: string): Attachment | null {
    const row = this.db.prepare('SELECT * FROM attachment WHERE id = ?').get(id) as
      AttachmentRow | undefined
    return row ? toAttachment(row) : null
  }

  listByOwner(ownerKind: AttachmentOwnerKind, ownerId: string): readonly Attachment[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM attachment WHERE owner_kind = ? AND owner_id = ? ORDER BY added_on DESC, rowid DESC'
      )
      .all(ownerKind, ownerId) as AttachmentRow[]
    return rows.map(toAttachment)
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM attachment WHERE id = ?').run(id)
  }

  deleteByOwner(ownerKind: AttachmentOwnerKind, ownerId: string): readonly string[] {
    const ids = (
      this.db
        .prepare('SELECT id FROM attachment WHERE owner_kind = ? AND owner_id = ?')
        .all(ownerKind, ownerId) as { id: string }[]
    ).map((row) => row.id)
    this.db
      .prepare('DELETE FROM attachment WHERE owner_kind = ? AND owner_id = ?')
      .run(ownerKind, ownerId)
    return ids
  }
}

function toAttachment(row: AttachmentRow): Attachment {
  return createAttachment({
    id: row.id,
    ownerKind: oneOf(row.owner_kind, ATTACHMENT_OWNER_KINDS, 'type d’objet'),
    ownerId: row.owner_id,
    fileName: row.name,
    size: row.size,
    addedOn: row.added_on,
    note: row.note
  })
}
