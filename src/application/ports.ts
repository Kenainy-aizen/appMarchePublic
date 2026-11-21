import type {
  AttachmentRepository,
  CandidateRepository,
  ContractRepository,
  PpmRepository,
  ProcedureRepository
} from '@domain/repositories'
import type { RegionSummary } from '@domain/region'

/** Clé enveloppée (AES-256-GCM), chaque champ encodé en base64. */
export interface WrappedKey {
  readonly iv: string
  readonly data: string
  readonly tag: string
}

/**
 * Secrets d'une région tels qu'ils sont conservés sur disque. Aucun n'est utilisable seul :
 * la clé de chiffrement de la base (DEK) est protégée à la fois par le mot de passe et par la clé de récupération.
 */
export interface RegionSecrets {
  readonly version: 1
  readonly kdf: {
    readonly algorithm: 'scrypt'
    readonly n: number
    readonly r: number
    readonly p: number
    readonly salt: string
  }
  readonly passwordWrappedKey: WrappedKey
  readonly recoverySalt: string
  readonly recoveryWrappedKey: WrappedKey
}

export interface RegisteredRegion extends RegionSummary {
  readonly createdOn: string
  readonly secrets: RegionSecrets
}

/** Gestion des clés : création, ouverture par mot de passe ou par clé de récupération. */
export interface RegionKeyService {
  createSecrets(
    regionId: string,
    password: string
  ): Promise<{ secrets: RegionSecrets; dataKey: Buffer; recoveryKey: string }>
  /** @throws DomainError `INVALID_PASSWORD` */
  unlockWithPassword(regionId: string, secrets: RegionSecrets, password: string): Promise<Buffer>
  /** @throws DomainError `INVALID_RECOVERY_KEY` */
  unlockWithRecoveryKey(regionId: string, secrets: RegionSecrets, recoveryKey: string): Buffer
}

/** Liste des régions et de leurs secrets chiffrés (fichier de registre). */
export interface RegionRegistry {
  list(): readonly RegisteredRegion[]
  find(regionId: string): RegisteredRegion | null
  add(region: RegisteredRegion): void
}

/** Réglages généraux de l'application, communs à toutes les régions (pas de secret). */
export interface OrganizationSettings {
  /** Nom de la PRMP, ou null tant qu'il n'a pas été renseigné. */
  getName(): string | null
  saveName(name: string): void
  /** Combien de jours à l'avance signaler une échéance (7, 15, 30 ou 60 ; 15 par défaut). */
  getAlertHorizonDays(): number
  saveAlertHorizonDays(days: number): void
}

/** Contenu des documents joints d'UNE région : fichiers chiffrés, jamais lisibles en clair sur le disque. */
export interface AttachmentFileStore {
  write(attachmentId: string, bytes: Uint8Array): void
  /** @throws DomainError `ATTACHMENT_UNREADABLE` si le fichier manque, est corrompu ou a été modifié */
  read(attachmentId: string): Uint8Array
  /** Sans erreur si le fichier n'existe pas. */
  delete(attachmentId: string): void
}

/** Les dépôts d'UNE région. Un cas d'utilisation métier ne reçoit jamais que ceux de la région active. */
export interface RegionRepositories {
  readonly ppms: PpmRepository
  readonly procedures: ProcedureRepository
  readonly candidates: CandidateRepository
  readonly contracts: ContractRepository
  readonly attachments: AttachmentRepository
}

/** Base d'une région ouverte (déchiffrée). Doit être fermée explicitement. */
export interface RegionWorkspace {
  readonly regionId: string
  readonly repositories: RegionRepositories
  readonly files: AttachmentFileStore
  close(): void
}

/** Fichiers de données des régions. */
export interface RegionStorage {
  /** Crée et initialise (migrations) la base chiffrée d'une nouvelle région, puis la referme. */
  create(regionId: string, dataKey: Buffer): void
  /** @throws DomainError `REGION_DATA_MISSING` si le fichier a disparu */
  open(regionId: string, dataKey: Buffer): RegionWorkspace
  /** Supprime les fichiers d'une région (nettoyage après une création interrompue). */
  remove(regionId: string): void
}
