import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  AddAttachmentUseCase,
  ListAttachmentsUseCase,
  ReadAttachmentUseCase,
  RemoveAttachmentUseCase
} from '@application/attachments/attachment-use-cases'
import { LoginThrottle } from '@application/login-throttle'
import { CreateProcedureUseCase } from '@application/procedures/create-procedure'
import { DeleteProcedureUseCase } from '@application/procedures/delete-procedure'
import { RegionSession } from '@application/region-session'
import { CreateRegionUseCase } from '@application/regions/create-region'
import { OpenRegionUseCase } from '@application/regions/open-region'
import { DomainError } from '@domain/shared/errors'
import { ScryptRegionKeyService } from '@infrastructure/crypto/scrypt-key-service'
import { JsonRegionRegistry } from '@infrastructure/json-region-registry'
import { SqliteRegionStorage } from '@infrastructure/sqlite/region-storage'
import { SystemClock, UuidGenerator } from '@infrastructure/system-ports'
import { createTempDirectory } from './helpers'

/** Documents joints avec les VRAIS composants : base SQLite chiffrée et fichiers chiffrés sur le disque. */
const PASSWORD_A = 'phrase de passe de la région A'
const PASSWORD_B = 'phrase de passe de la région B'
const MARKER = 'CONFIDENTIEL-MONTANT-12345678'
const FILE_NAME = 'Procès-verbal secret.pdf'
const PDF = Buffer.from(`%PDF-1.7\n${MARKER}\n`)

const temp = { current: createTempDirectory() }
beforeEach(() => {
  temp.current = createTempDirectory()
})
afterEach(() => {
  temp.current.cleanup()
})

interface App {
  readonly session: RegionSession
  readonly storage: SqliteRegionStorage
  readonly createRegion: CreateRegionUseCase
  readonly openRegion: OpenRegionUseCase
  readonly createProcedure: CreateProcedureUseCase
  readonly deleteProcedure: DeleteProcedureUseCase
  readonly add: AddAttachmentUseCase
  readonly list: ListAttachmentsUseCase
  readonly read: ReadAttachmentUseCase
  readonly remove: RemoveAttachmentUseCase
}

function boot(): App {
  const registry = new JsonRegionRegistry(join(temp.current.path, 'regions.json'))
  const keys = new ScryptRegionKeyService({ n: 1024, r: 8, p: 1 })
  const storage = new SqliteRegionStorage(join(temp.current.path, 'regions'))
  const clock = new SystemClock()
  const ids = new UuidGenerator()
  const session = new RegionSession()
  const throttle = new LoginThrottle()
  return {
    session,
    storage,
    createRegion: new CreateRegionUseCase(registry, keys, storage, ids, clock, throttle),
    openRegion: new OpenRegionUseCase(registry, keys, storage, session, throttle, clock),
    createProcedure: new CreateProcedureUseCase(session, ids, clock),
    deleteProcedure: new DeleteProcedureUseCase(session),
    add: new AddAttachmentUseCase(session, ids, clock),
    list: new ListAttachmentsUseCase(session),
    read: new ReadAttachmentUseCase(session),
    remove: new RemoveAttachmentUseCase(session)
  }
}

const filesDir = (regionId: string): string =>
  join(temp.current.path, 'regions', `${regionId}.files`)
const listFiles = (regionId: string): string[] =>
  existsSync(filesDir(regionId)) ? readdirSync(filesDir(regionId)) : []

async function setUp(): Promise<{ aId: string; bId: string }> {
  const app = boot()
  const a = await app.createRegion.execute({
    name: 'Région A',
    password: PASSWORD_A,
    passwordConfirmation: PASSWORD_A
  })
  const b = await app.createRegion.execute({
    name: 'Région B',
    password: PASSWORD_B,
    passwordConfirmation: PASSWORD_B
  })
  return { aId: a.region.id, bId: b.region.id }
}

const newProcedure = (app: App): string =>
  app.createProcedure.execute({
    reference: 'DAO-001/2026',
    object: 'Fourniture de mobilier',
    method: 'DAO',
    ppmLineId: null,
    estimatedAmount: null
  }).id

const codeOf = (action: () => unknown): string => {
  try {
    action()
  } catch (error) {
    if (error instanceof DomainError) return error.code
    throw error
  }
  return 'AUCUNE_ERREUR'
}

describe('documents joints sur de vrais fichiers chiffrés', () => {
  it('le document est chiffré sur le disque : ni contenu, ni nom d’origine lisibles nulle part', async () => {
    const { aId } = await setUp()
    const app = boot()
    await app.openRegion.execute({ regionId: aId, password: PASSWORD_A })
    const ownerId = newProcedure(app)

    const { id } = app.add.execute({
      ownerKind: 'PROCEDURE',
      ownerId,
      fileName: FILE_NAME,
      bytes: PDF,
      note: null
    })

    expect(listFiles(aId)).toEqual([id]) // un seul fichier, nommé par son identifiant
    const everyFile = [join(filesDir(aId), id), join(temp.current.path, 'regions', `${aId}.sqlite`)]
    for (const file of everyFile) {
      const bytes = readFileSync(file)
      expect(bytes.includes(MARKER), `contenu lisible dans ${file}`).toBe(false)
      expect(bytes.includes('Procès-verbal'), `nom lisible dans ${file}`).toBe(false)
      expect(bytes.includes('%PDF'), `signature lisible dans ${file}`).toBe(false)
    }
    expect(readFileSync(join(temp.current.path, 'regions.json'), 'utf8')).not.toContain(
      'Procès-verbal'
    )
  })

  it('le document survit à un redémarrage et se relit à l’identique', async () => {
    const { aId } = await setUp()
    const first = boot()
    await first.openRegion.execute({ regionId: aId, password: PASSWORD_A })
    const ownerId = newProcedure(first)
    const { id } = first.add.execute({
      ownerKind: 'PROCEDURE',
      ownerId,
      fileName: FILE_NAME,
      bytes: PDF,
      note: 'Original signé'
    })
    first.session.close()

    const second = boot()
    await second.openRegion.execute({ regionId: aId, password: PASSWORD_A })

    expect(second.list.execute({ ownerKind: 'PROCEDURE', ownerId })).toEqual([
      expect.objectContaining({
        id,
        name: FILE_NAME,
        mimeType: 'application/pdf',
        size: PDF.length,
        note: 'Original signé'
      })
    ])
    const document = second.read.execute({ attachmentId: id })
    expect(document.name).toBe(FILE_NAME)
    expect(Buffer.from(document.bytes).equals(PDF)).toBe(true)
  })

  it('un document de la région A est inaccessible depuis la région B', async () => {
    const { aId, bId } = await setUp()
    const app = boot()
    await app.openRegion.execute({ regionId: aId, password: PASSWORD_A })
    const ownerId = newProcedure(app)
    const { id } = app.add.execute({
      ownerKind: 'PROCEDURE',
      ownerId,
      fileName: FILE_NAME,
      bytes: PDF,
      note: null
    })
    app.session.close()

    await app.openRegion.execute({ regionId: bId, password: PASSWORD_B })

    expect(codeOf(() => app.list.execute({ ownerKind: 'PROCEDURE', ownerId }))).toBe(
      'OWNER_NOT_FOUND'
    )
    expect(codeOf(() => app.read.execute({ attachmentId: id }))).toBe('ATTACHMENT_NOT_FOUND')
    expect(listFiles(bId)).toEqual([])
  })

  it('retirer un document efface son fichier du disque', async () => {
    const { aId } = await setUp()
    const app = boot()
    await app.openRegion.execute({ regionId: aId, password: PASSWORD_A })
    const ownerId = newProcedure(app)
    const { id } = app.add.execute({
      ownerKind: 'PROCEDURE',
      ownerId,
      fileName: FILE_NAME,
      bytes: PDF,
      note: null
    })

    app.remove.execute({ attachmentId: id })

    expect(listFiles(aId)).toEqual([])
    expect(app.list.execute({ ownerKind: 'PROCEDURE', ownerId })).toEqual([])
  })

  it('supprimer la procédure efface les fichiers de ses documents du disque', async () => {
    const { aId } = await setUp()
    const app = boot()
    await app.openRegion.execute({ regionId: aId, password: PASSWORD_A })
    const ownerId = newProcedure(app)
    app.add.execute({ ownerKind: 'PROCEDURE', ownerId, fileName: 'a.pdf', bytes: PDF, note: null })
    app.add.execute({ ownerKind: 'PROCEDURE', ownerId, fileName: 'b.pdf', bytes: PDF, note: null })
    expect(listFiles(aId)).toHaveLength(2)

    app.deleteProcedure.execute({ procedureId: ownerId })

    expect(listFiles(aId)).toEqual([])
  })

  it('détecte un fichier modifié ou disparu, sans empêcher de lister les documents', async () => {
    const { aId } = await setUp()
    const app = boot()
    await app.openRegion.execute({ regionId: aId, password: PASSWORD_A })
    const ownerId = newProcedure(app)
    const tampered = app.add.execute({
      ownerKind: 'PROCEDURE',
      ownerId,
      fileName: 'a.pdf',
      bytes: PDF,
      note: null
    })
    const missing = app.add.execute({
      ownerKind: 'PROCEDURE',
      ownerId,
      fileName: 'b.pdf',
      bytes: PDF,
      note: null
    })

    const path = join(filesDir(aId), tampered.id)
    const bytes = readFileSync(path)
    bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 1
    writeFileSync(path, bytes)
    writeFileSync(join(filesDir(aId), missing.id), Buffer.alloc(0)) // fichier vidé

    expect(codeOf(() => app.read.execute({ attachmentId: tampered.id }))).toBe(
      'ATTACHMENT_UNREADABLE'
    )
    expect(codeOf(() => app.read.execute({ attachmentId: missing.id }))).toBe(
      'ATTACHMENT_UNREADABLE'
    )
    expect(app.list.execute({ ownerKind: 'PROCEDURE', ownerId })).toHaveLength(2)
  })

  it('un fichier recopié sous l’identifiant d’un autre document est refusé', async () => {
    const { aId } = await setUp()
    const app = boot()
    await app.openRegion.execute({ regionId: aId, password: PASSWORD_A })
    const ownerId = newProcedure(app)
    const real = app.add.execute({
      ownerKind: 'PROCEDURE',
      ownerId,
      fileName: 'a.pdf',
      bytes: PDF,
      note: null
    })
    const other = app.add.execute({
      ownerKind: 'PROCEDURE',
      ownerId,
      fileName: 'b.pdf',
      bytes: Buffer.from('%PDF-1.4 AUTRE'),
      note: null
    })

    writeFileSync(join(filesDir(aId), other.id), readFileSync(join(filesDir(aId), real.id)))

    expect(codeOf(() => app.read.execute({ attachmentId: other.id }))).toBe('ATTACHMENT_UNREADABLE')
    expect(Buffer.from(app.read.execute({ attachmentId: real.id }).bytes).equals(PDF)).toBe(true)
  })

  it('supprimer une région (création interrompue) efface aussi son dossier de documents', async () => {
    const { aId } = await setUp()
    const app = boot()
    await app.openRegion.execute({ regionId: aId, password: PASSWORD_A })
    const ownerId = newProcedure(app)
    app.add.execute({ ownerKind: 'PROCEDURE', ownerId, fileName: 'a.pdf', bytes: PDF, note: null })
    app.session.close()
    expect(existsSync(filesDir(aId))).toBe(true)

    app.storage.remove(aId)

    expect(existsSync(filesDir(aId))).toBe(false)
    expect(existsSync(join(temp.current.path, 'regions', `${aId}.sqlite`))).toBe(false)
  })
})
