import type { Migration } from '../migrator'

/**
 * Schéma initial d'une base de région. ATTENTION : une migration publiée ne doit JAMAIS être modifiée ;
 * toute évolution du schéma passe par une nouvelle migration (002, 003, ...).
 * Les listes de valeurs des CHECK sont volontairement écrites en dur (figées avec la migration).
 */
export const initialSchema: Migration = {
  version: 1,
  name: 'initial-schema',
  sql: `
    CREATE TABLE ppm (
      id TEXT PRIMARY KEY,
      year INTEGER NOT NULL CHECK (year BETWEEN 2000 AND 2100),
      number INTEGER NOT NULL CHECK (number >= 1),
      elaborated_on TEXT NOT NULL,
      last_update_on TEXT,
      update_count INTEGER NOT NULL DEFAULT 0 CHECK (update_count >= 0),
      UNIQUE (year, number)
    ) STRICT;

    CREATE TABLE ppm_line (
      id TEXT PRIMARY KEY,
      ppm_id TEXT NOT NULL REFERENCES ppm (id) ON DELETE CASCADE,
      position INTEGER NOT NULL CHECK (position >= 0),
      nature TEXT NOT NULL CHECK (nature IN ('TRAVAUX', 'FOURNITURES', 'SERVICES', 'PRESTATIONS_INTELLECTUELLES')),
      object TEXT NOT NULL,
      financing TEXT,
      accounts TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(accounts)),
      planned_launch_date TEXT,
      planned_bid_opening_date TEXT,
      planned_award_date TEXT,
      method TEXT CHECK (method IS NULL OR method IN ('DAO', 'AOR', 'DCP', 'AMI', 'APQ')),
      procedure_lead TEXT
    ) STRICT;
    CREATE INDEX idx_ppm_line_ppm ON ppm_line (ppm_id);

    CREATE TABLE ppm_line_beneficiary (
      line_id TEXT NOT NULL REFERENCES ppm_line (id) ON DELETE CASCADE,
      position INTEGER NOT NULL CHECK (position >= 0),
      service TEXT NOT NULL,
      amount INTEGER NOT NULL CHECK (amount >= 0),
      PRIMARY KEY (line_id, position)
    ) STRICT;

    CREATE TABLE candidate (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      nif TEXT,
      stat TEXT,
      address TEXT,
      phone TEXT,
      email TEXT
    ) STRICT;

    CREATE TABLE procedure (
      id TEXT PRIMARY KEY,
      reference TEXT NOT NULL UNIQUE,
      object TEXT NOT NULL,
      method TEXT NOT NULL CHECK (method IN ('DAO', 'AOR', 'DCP', 'AMI', 'APQ')),
      ppm_line_id TEXT REFERENCES ppm_line (id) ON DELETE SET NULL,
      estimated_amount INTEGER CHECK (estimated_amount IS NULL OR estimated_amount >= 0),
      created_on TEXT NOT NULL
    ) STRICT;
    CREATE INDEX idx_procedure_ppm_line ON procedure (ppm_line_id);

    CREATE TABLE procedure_step (
      procedure_id TEXT NOT NULL REFERENCES procedure (id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('PUBLICATION', 'OUVERTURE_PLIS', 'EVALUATION', 'ATTRIBUTION', 'APPROBATION')),
      planned_date TEXT,
      actual_date TEXT,
      validated_on TEXT,
      PRIMARY KEY (procedure_id, kind)
    ) STRICT;

    CREATE TABLE bid (
      id TEXT PRIMARY KEY,
      procedure_id TEXT NOT NULL REFERENCES procedure (id) ON DELETE CASCADE,
      candidate_id TEXT NOT NULL REFERENCES candidate (id) ON DELETE RESTRICT,
      amount INTEGER NOT NULL CHECK (amount >= 0),
      awarded INTEGER NOT NULL DEFAULT 0 CHECK (awarded IN (0, 1)),
      UNIQUE (procedure_id, candidate_id)
    ) STRICT;
    CREATE UNIQUE INDEX idx_bid_single_awarded ON bid (procedure_id) WHERE awarded = 1;

    CREATE TABLE contract (
      id TEXT PRIMARY KEY,
      reference TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL CHECK (kind IN ('MARCHE', 'CONVENTION', 'ACHAT_DIRECT')),
      procedure_id TEXT REFERENCES procedure (id) ON DELETE RESTRICT,
      ppm_line_id TEXT REFERENCES ppm_line (id) ON DELETE SET NULL,
      holder_id TEXT NOT NULL REFERENCES candidate (id) ON DELETE RESTRICT,
      object TEXT NOT NULL,
      amount INTEGER NOT NULL CHECK (amount >= 0),
      signed_on TEXT,
      CHECK (kind <> 'MARCHE' OR procedure_id IS NOT NULL)
    ) STRICT;

    CREATE TABLE contract_event (
      id TEXT PRIMARY KEY,
      contract_id TEXT NOT NULL REFERENCES contract (id) ON DELETE CASCADE,
      position INTEGER NOT NULL CHECK (position >= 0),
      kind TEXT NOT NULL CHECK (kind IN ('ORDRE_SERVICE_DEMARRAGE', 'ORDRE_SERVICE_ARRET', 'ORDRE_SERVICE_REPRISE', 'RECEPTION_PROVISOIRE', 'RECEPTION_DEFINITIVE', 'AVENANT', 'CLOTURE')),
      occurred_on TEXT NOT NULL,
      amount_delta INTEGER,
      note TEXT,
      CHECK (kind <> 'AVENANT' OR amount_delta IS NOT NULL)
    ) STRICT;
    CREATE INDEX idx_contract_event_contract ON contract_event (contract_id);
  `
}
