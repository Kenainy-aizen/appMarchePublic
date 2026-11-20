import {
  assertContentMatchesExtension,
  createAttachment,
  extensionOf,
  parseAttachmentOwnerKind
} from '@domain/attachment'
import type { Clock, IdGenerator } from '@domain/shared/ports'
import type { RegionSession } from '../region-session'
import { assertOwnerExists, requireAttachment } from './attachment-access'
import { type AttachmentView, toAttachmentView } from './views'

/** Documents joints à un objet, du plus récent au plus ancien. */
export class ListAttachmentsUseCase {
  constructor(private readonly session: RegionSession) {}

  execute(input: {
    readonly ownerKind: string
    readonly ownerId: string
  }): readonly AttachmentView[] {
    const { repositories } = this.session.requireWorkspace()
    const ownerKind = parseAttachmentOwnerKind(input.ownerKind)
    assertOwnerExists(repositories, ownerKind, input.ownerId)
    return repositories.attachments.listByOwner(ownerKind, input.ownerId).map(toAttachmentView)
  }
}

/**
 * Joint un document : type et taille contrôlés, contenu vérifié contre l'extension, puis fichier chiffré écrit
 * AVANT les métadonnées (si l'enregistrement échoue, le fichier est supprimé : rien ne reste en suspens).
 */
export class AddAttachmentUseCase {
  constructor(
    private readonly session: RegionSession,
    private readonly ids: IdGenerator,
    private readonly clock: Clock
  ) {}

  execute(input: {
    readonly ownerKind: string
    readonly ownerId: string
    readonly fileName: string
    readonly bytes: Uint8Array
    readonly note: string | null
  }): AttachmentView {
    const workspace = this.session.requireWorkspace()
    const ownerKind = parseAttachmentOwnerKind(input.ownerKind)
    assertOwnerExists(workspace.repositories, ownerKind, input.ownerId)

    const attachment = createAttachment({
      id: this.ids.newId(),
      ownerKind,
      ownerId: input.ownerId,
      fileName: input.fileName,
      size: input.bytes.length,
      addedOn: this.clock.today(),
      note: input.note
    })
    assertContentMatchesExtension(extensionOf(attachment.name), input.bytes.subarray(0, 16))

    workspace.files.write(attachment.id, input.bytes)
    try {
      workspace.repositories.attachments.save(attachment)
    } catch (error) {
      workspace.files.delete(attachment.id)
      throw error
    }
    return toAttachmentView(attachment)
  }
}

export class RemoveAttachmentUseCase {
  constructor(private readonly session: RegionSession) {}

  execute(input: { readonly attachmentId: string }): void {
    const workspace = this.session.requireWorkspace()
    const attachment = requireAttachment(workspace.repositories, input.attachmentId)
    workspace.repositories.attachments.delete(attachment.id)
    workspace.files.delete(attachment.id)
  }
}

/** Relit et déchiffre un document pour en enregistrer une copie (le contenu ne quitte jamais le processus principal autrement). */
export class ReadAttachmentUseCase {
  constructor(private readonly session: RegionSession) {}

  execute(input: { readonly attachmentId: string }): {
    readonly name: string
    readonly bytes: Uint8Array
  } {
    const workspace = this.session.requireWorkspace()
    const attachment = requireAttachment(workspace.repositories, input.attachmentId)
    return { name: attachment.name, bytes: workspace.files.read(attachment.id) }
  }
}
