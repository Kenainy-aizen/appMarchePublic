import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CreateCandidateUseCase,
  DeleteCandidateUseCase
} from '@application/candidates/candidate-use-cases'
import {
  AddAttachmentUseCase,
  ListAttachmentsUseCase,
  ReadAttachmentUseCase,
  RemoveAttachmentUseCase
} from '@application/attachments/attachment-use-cases'
import {
  CreateContractUseCase,
  DeleteContractUseCase
} from '@application/contracts/contract-use-cases'
import { CreateProcedureUseCase } from '@application/procedures/create-procedure'
import { DeleteProcedureUseCase } from '@application/procedures/delete-procedure'
import { RegionSession } from '@application/region-session'
import { MAX_ATTACHMENT_BYTES } from '@domain/attachment'
import { createContract } from '@domain/contract'
import { ariary } from '@domain/shared/ariary'
import { DomainError } from '@domain/shared/errors'
import { FakeClock, SequentialIds } from './fakes'
import { type ActiveRegion, openFakeRegion } from './ppm-fakes'

let region: ActiveRegion
let add: AddAttachmentUseCase
let list: ListAttachmentsUseCase
let remove: RemoveAttachmentUseCase
let read: ReadAttachmentUseCase
let procedureId: string

const PDF = Uint8Array.from([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x41, 0x42, 0x43
])
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])

beforeEach(() => {
  region = openFakeRegion()
  const ids = new SequentialIds()
  const clock = new FakeClock() // aujourd'hui = 2026-10-04
  const { session } = region
  add = new AddAttachmentUseCase(session, ids, clock)
  list = new ListAttachmentsUseCase(session)
  remove = new RemoveAttachmentUseCase(session)
  read = new ReadAttachmentUseCase(session)
  procedureId = new CreateProcedureUseCase(session, ids, clock).execute({
    reference: 'DAO-001/2026',
    object: 'Fourniture de mobilier',
    method: 'DAO',
    ppmLineId: null,
    estimatedAmount: null
  }).id
})

const codeOf = (action: () => unknown): string => {
  try {
    action()
  } catch (error) {
    if (error instanceof DomainError) return error.code
    throw error
  }
  return 'AUCUNE_ERREUR'
}

const attach = (
  overrides: Partial<Parameters<AddAttachmentUseCase['execute']>[0]> = {}
): ReturnType<AddAttachmentUseCase['execute']> =>
  add.execute({
    ownerKind: 'PROCEDURE',
    ownerId: procedureId,
    fileName: 'PV ouverture des plis.pdf',
    bytes: PDF,
    note: null,
    ...overrides
  })

describe('sans région ouverte', () => {
  it('toutes les commandes répondent NO_ACTIVE_REGION', () => {
    const closed = new RegionSession()
    expect(
      codeOf(() =>
        new ListAttachmentsUseCase(closed).execute({ ownerKind: 'PROCEDURE', ownerId: 'x' })
      )
    ).toBe('NO_ACTIVE_REGION')
    expect(
      codeOf(() => {
        new RemoveAttachmentUseCase(closed).execute({ attachmentId: 'x' })
      })
    ).toBe('NO_ACTIVE_REGION')
    expect(codeOf(() => new ReadAttachmentUseCase(closed).execute({ attachmentId: 'x' }))).toBe(
      'NO_ACTIVE_REGION'
    )
  })
})

describe('joindre un document', () => {
  it('enregistre le fichier et ses métadonnées, à la date du jour', () => {
    const view = attach({ note: '  Original signé  ' })

    expect(view).toMatchObject({
      ownerKind: 'PROCEDURE',
      ownerId: procedureId,
      name: 'PV ouverture des plis.pdf',
      mimeType: 'application/pdf',
      size: PDF.length,
      addedOn: '2026-10-04',
      note: 'Original signé'
    })
    expect(region.files.files.get(view.id)).toEqual(PDF)
    expect(list.execute({ ownerKind: 'PROCEDURE', ownerId: procedureId })).toEqual([view])
  })

  it('ne garde du nom d’origine que le nom du fichier, jamais un chemin', () => {
    expect(attach({ fileName: 'C:\\Users\\prmp\\Documents\\..\\PV.pdf' }).name).toBe('PV.pdf')
    expect(attach({ fileName: '../../etc/PV2.pdf' }).name).toBe('PV2.pdf')
  })

  it('liste du plus récent au plus ancien et ne mélange pas les objets', () => {
    const first = attach({ fileName: 'a.pdf' })
    const second = attach({ fileName: 'b.png', bytes: PNG })
    const candidate = new CreateCandidateUseCase(region.session, new SequentialIds()).execute({
      name: 'SARL Alpha',
      nif: null,
      stat: null,
      address: null,
      phone: null,
      email: null
    })
    add.execute({
      ownerKind: 'CANDIDATE',
      ownerId: candidate.id,
      fileName: 'c.pdf',
      bytes: PDF,
      note: null
    })

    expect(list.execute({ ownerKind: 'PROCEDURE', ownerId: procedureId }).map((a) => a.id)).toEqual(
      [second.id, first.id]
    )
    expect(list.execute({ ownerKind: 'CANDIDATE', ownerId: candidate.id })).toHaveLength(1)
  })

  it.each([
    ['type non accepté', { fileName: 'programme.exe', bytes: PDF }, 'FILE_TYPE_NOT_ALLOWED'],
    ['fichier vide', { bytes: new Uint8Array(0) }, 'FILE_EMPTY'],
    [
      'exécutable renommé en .pdf',
      { bytes: Uint8Array.from([0x4d, 0x5a, 0x90, 0x00, 0x03]) },
      'FILE_CONTENT_MISMATCH'
    ],
    ['PDF renommé en .png', { fileName: 'scan.png', bytes: PDF }, 'FILE_CONTENT_MISMATCH'],
    ['objet inconnu', { ownerId: 'absent' }, 'OWNER_NOT_FOUND'],
    ['type d’objet inconnu', { ownerKind: 'PPM' }, 'INVALID_VALUE'],
    ['note trop longue', { note: 'x'.repeat(501) }, 'NOTE_TOO_LONG']
  ] as const)('refuse : %s — sans rien écrire', (_label, overrides, code) => {
    expect(codeOf(() => attach(overrides))).toBe(code)
    expect(region.files.files.size).toBe(0)
    expect(list.execute({ ownerKind: 'PROCEDURE', ownerId: procedureId })).toEqual([])
  })

  it('refuse un fichier au-delà de la taille maximale, sans rien écrire', () => {
    const huge = new Uint8Array(MAX_ATTACHMENT_BYTES + 1)
    huge.set(PDF)
    expect(codeOf(() => attach({ bytes: huge }))).toBe('FILE_TOO_LARGE')
    expect(region.files.files.size).toBe(0)
  })

  it('supprime le fichier écrit si l’enregistrement des métadonnées échoue (rien ne reste en suspens)', () => {
    vi.spyOn(region.repositories.attachments, 'save').mockImplementation(() => {
      throw new Error('disque plein')
    })

    expect(() => attach()).toThrow('disque plein')
    expect(region.files.files.size).toBe(0)
  })
})

describe('retirer et relire un document', () => {
  it('retire les métadonnées et le fichier', () => {
    const { id } = attach()
    remove.execute({ attachmentId: id })

    expect(list.execute({ ownerKind: 'PROCEDURE', ownerId: procedureId })).toEqual([])
    expect(region.files.files.has(id)).toBe(false)
  })

  it('refuse un document inconnu', () => {
    expect(
      codeOf(() => {
        remove.execute({ attachmentId: 'absent' })
      })
    ).toBe('ATTACHMENT_NOT_FOUND')
    expect(codeOf(() => read.execute({ attachmentId: 'absent' }))).toBe('ATTACHMENT_NOT_FOUND')
  })

  it('relit le nom et le contenu d’origine', () => {
    const { id } = attach()
    expect(read.execute({ attachmentId: id })).toEqual({
      name: 'PV ouverture des plis.pdf',
      bytes: PDF
    })
  })

  it('signale un fichier disparu ou endommagé', () => {
    const { id } = attach()
    region.files.delete(id)
    expect(codeOf(() => read.execute({ attachmentId: id }))).toBe('ATTACHMENT_UNREADABLE')
  })
})

describe('suppression de l’objet : ses documents disparaissent avec lui', () => {
  it('une procédure supprimée emporte ses documents et leurs fichiers', () => {
    const { id } = attach()
    new DeleteProcedureUseCase(region.session).execute({ procedureId })

    expect(region.repositories.attachments.findById(id)).toBeNull()
    expect(region.files.files.has(id)).toBe(false)
  })

  it('une suppression refusée conserve les documents', () => {
    const { id } = attach()
    const holder = new CreateCandidateUseCase(region.session, new SequentialIds()).execute({
      name: 'SARL Alpha',
      nif: null,
      stat: null,
      address: null,
      phone: null,
      email: null
    })
    region.repositories.contracts.save(
      createContract({
        id: 'k1',
        reference: 'M-1',
        kind: 'MARCHE',
        procedureId,
        holderId: holder.id,
        object: 'Marché',
        amount: ariary(1000)
      })
    )

    expect(
      codeOf(() => {
        new DeleteProcedureUseCase(region.session).execute({ procedureId })
      })
    ).toBe('PROCEDURE_IN_USE')
    expect(region.repositories.attachments.findById(id)).not.toBeNull()
    expect(region.files.files.has(id)).toBe(true)
  })

  it('un contrat supprimé emporte ses documents', () => {
    const ids = new SequentialIds()
    const holder = new CreateCandidateUseCase(region.session, ids).execute({
      name: 'SARL Alpha',
      nif: null,
      stat: null,
      address: null,
      phone: null,
      email: null
    })
    const contract = new CreateContractUseCase(region.session, ids).execute({
      kind: 'ACHAT_DIRECT',
      procedureId: null,
      reference: 'A-1',
      object: 'Achat',
      holderId: holder.id,
      ppmLineId: null,
      amount: 1000,
      signedOn: null
    })
    const { id } = add.execute({
      ownerKind: 'CONTRACT',
      ownerId: contract.id,
      fileName: 'contrat.pdf',
      bytes: PDF,
      note: null
    })

    new DeleteContractUseCase(region.session).execute({ contractId: contract.id })

    expect(region.repositories.attachments.findById(id)).toBeNull()
    expect(region.files.files.has(id)).toBe(false)
  })

  it('un candidat supprimé emporte ses documents', () => {
    const candidate = new CreateCandidateUseCase(region.session, new SequentialIds()).execute({
      name: 'SARL Alpha',
      nif: null,
      stat: null,
      address: null,
      phone: null,
      email: null
    })
    const { id } = add.execute({
      ownerKind: 'CANDIDATE',
      ownerId: candidate.id,
      fileName: 'statuts.pdf',
      bytes: PDF,
      note: null
    })

    new DeleteCandidateUseCase(region.session).execute({ candidateId: candidate.id })

    expect(region.repositories.attachments.findById(id)).toBeNull()
    expect(region.files.files.has(id)).toBe(false)
  })
})
