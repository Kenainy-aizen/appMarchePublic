import type { Migration } from '../migrator'

/**
 * Documents joints : seules les métadonnées sont dans la base (chiffrée) ; le contenu est dans des fichiers
 * chiffrés à part. Le lien avec l'objet (procédure, contrat, candidat) est volontairement sans clé étrangère :
 * la suppression de l'objet supprime ses documents dans l'application, qui efface aussi les fichiers.
 */
export const attachmentsSchema: Migration = {
  version: 2,
  name: 'attachments',
  sql: `
    CREATE TABLE attachment (
      id TEXT PRIMARY KEY,
      owner_kind TEXT NOT NULL CHECK (owner_kind IN ('PROCEDURE', 'CONTRACT', 'CANDIDATE')),
      owner_id TEXT NOT NULL,
      name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL CHECK (size > 0),
      added_on TEXT NOT NULL,
      note TEXT
    ) STRICT;
    CREATE INDEX idx_attachment_owner ON attachment (owner_kind, owner_id);
  `
}
