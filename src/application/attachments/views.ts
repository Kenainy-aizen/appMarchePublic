import type { Attachment } from '@domain/attachment'

export interface AttachmentView {
  readonly id: string
  readonly ownerKind: string
  readonly ownerId: string
  readonly name: string
  readonly mimeType: string
  readonly size: number
  readonly addedOn: string
  readonly note: string | null
}

export function toAttachmentView(attachment: Attachment): AttachmentView {
  return {
    id: attachment.id,
    ownerKind: attachment.ownerKind,
    ownerId: attachment.ownerId,
    name: attachment.name,
    mimeType: attachment.mimeType,
    size: attachment.size,
    addedOn: attachment.addedOn,
    note: attachment.note
  }
}
