/**
 * Règles d'affichage des documents joints, partagées entre l'interface (sélecteur de fichier, contrôle de
 * taille avant envoi) et le processus principal. Un test vérifie qu'elles restent identiques à celles du domaine.
 */
export const ATTACHMENT_OWNER_CODES = ['PROCEDURE', 'CONTRACT', 'CANDIDATE'] as const
export type AttachmentOwnerCode = (typeof ATTACHMENT_OWNER_CODES)[number]

export const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'docx', 'xlsx'] as const

/** Valeur de l'attribut `accept` du sélecteur de fichier. */
export const FILE_INPUT_ACCEPT = ALLOWED_EXTENSIONS.map((extension) => `.${extension}`).join(',')

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024
