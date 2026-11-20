import { DomainError } from './shared/errors'
import { type IsoDate, parseIsoDate } from './shared/iso-date'
import { oneOf, optionalText, requiredText } from './shared/text'

/** Objets auxquels on peut joindre des documents. */
export const ATTACHMENT_OWNER_KINDS = ['PROCEDURE', 'CONTRACT', 'CANDIDATE'] as const
export type AttachmentOwnerKind = (typeof ATTACHMENT_OWNER_KINDS)[number]

export function parseAttachmentOwnerKind(value: string): AttachmentOwnerKind {
  return oneOf(value, ATTACHMENT_OWNER_KINDS, 'type d’objet')
}

/** Types de fichiers acceptés (extension -> type MIME) : documents et scans courants (ADR-030). */
export const ALLOWED_FILE_TYPES: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
}

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024
export const MAX_FILE_NAME_LENGTH = 150

export interface Attachment {
  readonly id: string
  readonly ownerKind: AttachmentOwnerKind
  readonly ownerId: string
  /** Nom d'origine, nettoyé. Il n'est JAMAIS utilisé comme nom de fichier sur le disque. */
  readonly name: string
  readonly mimeType: string
  readonly size: number
  readonly addedOn: IsoDate
  readonly note: string | null
}

/** Retire tout chemin, caractère de contrôle et caractère interdit sous Windows ; limite la longueur. */
export function sanitizeFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).at(-1) ?? ''
  const cleaned = Array.from(base)
    .filter(
      (char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127 && !'<>:"|?*'.includes(char)
    )
    .join('')
    .trim()
    .replace(/\s+/g, ' ')
  if (cleaned.length <= MAX_FILE_NAME_LENGTH) return cleaned
  const dot = cleaned.lastIndexOf('.')
  const extension = dot > 0 ? cleaned.slice(dot) : ''
  return `${cleaned.slice(0, MAX_FILE_NAME_LENGTH - extension.length)}${extension}`
}

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot < 0 ? '' : fileName.slice(dot + 1).toLowerCase()
}

const startsWith = (bytes: Uint8Array, signature: readonly number[]): boolean =>
  signature.every((value, index) => bytes[index] === value)

const SIGNATURES: Readonly<Record<string, readonly number[]>> = {
  pdf: [0x25, 0x50, 0x44, 0x46, 0x2d], // %PDF-
  jpg: [0xff, 0xd8, 0xff],
  jpeg: [0xff, 0xd8, 0xff],
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  docx: [0x50, 0x4b, 0x03, 0x04], // archive ZIP
  xlsx: [0x50, 0x4b, 0x03, 0x04]
}

/** Vérifie que le contenu correspond à l'extension (un exécutable renommé « .pdf » est refusé). */
export function assertContentMatchesExtension(extension: string, head: Uint8Array): void {
  const signature = SIGNATURES[extension]
  if (signature === undefined || !startsWith(head, signature)) {
    throw new DomainError(
      'FILE_CONTENT_MISMATCH',
      'Le contenu du fichier ne correspond pas à son type : il est peut-être endommagé ou mal nommé.'
    )
  }
}

export interface AttachmentInput {
  readonly id: string
  readonly ownerKind: AttachmentOwnerKind
  readonly ownerId: string
  readonly fileName: string
  readonly size: number
  readonly addedOn: string
  readonly note?: string | null
}

export function createAttachment(input: AttachmentInput): Attachment {
  const name = requiredText(sanitizeFileName(input.fileName), 'nom du fichier')
  const mimeType = ALLOWED_FILE_TYPES[extensionOf(name)]
  if (mimeType === undefined) {
    throw new DomainError(
      'FILE_TYPE_NOT_ALLOWED',
      `Ce type de fichier n’est pas accepté. Types acceptés : ${Object.keys(ALLOWED_FILE_TYPES).join(', ')}.`
    )
  }
  if (input.size <= 0) {
    throw new DomainError('FILE_EMPTY', 'Le fichier est vide.')
  }
  if (input.size > MAX_ATTACHMENT_BYTES) {
    throw new DomainError(
      'FILE_TOO_LARGE',
      `Le fichier dépasse la taille maximale de ${String(MAX_ATTACHMENT_BYTES / (1024 * 1024))} Mo.`
    )
  }
  const note = optionalText(input.note ?? null)
  if (note !== null && note.length > 500) {
    throw new DomainError('NOTE_TOO_LONG', 'La note ne doit pas dépasser 500 caractères.')
  }
  return {
    id: requiredText(input.id, 'identifiant'),
    ownerKind: input.ownerKind,
    ownerId: requiredText(input.ownerId, 'objet'),
    name,
    mimeType,
    size: input.size,
    addedOn: parseIsoDate(input.addedOn),
    note
  }
}
