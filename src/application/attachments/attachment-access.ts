import type { Attachment, AttachmentOwnerKind } from '@domain/attachment'
import { DomainError } from '@domain/shared/errors'
import type { RegionRepositories, RegionWorkspace } from '../ports'

/** L'objet auquel on joint un document doit exister dans la région ouverte. */
export function assertOwnerExists(
  repositories: RegionRepositories,
  ownerKind: AttachmentOwnerKind,
  ownerId: string
): void {
  const exists =
    ownerKind === 'PROCEDURE'
      ? repositories.procedures.findById(ownerId) !== null
      : ownerKind === 'CONTRACT'
        ? repositories.contracts.findById(ownerId) !== null
        : repositories.candidates.findById(ownerId) !== null
  if (!exists) {
    throw new DomainError('OWNER_NOT_FOUND', 'L’élément auquel joindre le document n’existe pas.')
  }
}

export function requireAttachment(
  repositories: RegionRepositories,
  attachmentId: string
): Attachment {
  const attachment = repositories.attachments.findById(attachmentId)
  if (attachment === null) {
    throw new DomainError('ATTACHMENT_NOT_FOUND', 'Ce document n’existe pas.')
  }
  return attachment
}

/**
 * Supprime les documents d'un objet qui disparaît : métadonnées puis fichiers chiffrés. À appeler APRÈS la
 * suppression réussie de l'objet (jamais si elle est refusée).
 */
export function removeAttachmentsOf(
  workspace: RegionWorkspace,
  ownerKind: AttachmentOwnerKind,
  ownerId: string
): void {
  const ids = workspace.repositories.attachments.deleteByOwner(ownerKind, ownerId)
  for (const id of ids) workspace.files.delete(id)
}
