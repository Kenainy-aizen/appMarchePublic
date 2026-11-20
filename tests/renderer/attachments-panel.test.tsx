// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import type { AttachmentDto } from '@shared/api'
import { FILE_INPUT_ACCEPT, MAX_ATTACHMENT_BYTES } from '@shared/attachment-options'
import { formatFileSize } from '../../src/renderer/src/format'
import { AttachmentsPanel } from '../../src/renderer/src/screens/AttachmentsPanel'
import { fail, installApiMock, ok } from './helpers'

afterEach(cleanup)

const attachment = (overrides: Partial<AttachmentDto> = {}): AttachmentDto => ({
  id: 'a1',
  ownerKind: 'PROCEDURE',
  ownerId: 'p1',
  name: 'PV ouverture des plis.pdf',
  mimeType: 'application/pdf',
  size: 1_572_864,
  addedOn: '2026-10-04',
  note: 'Original signé',
  ...overrides
})

const pdf = (name = 'PV.pdf'): File =>
  new File([Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])], name, {
    type: 'application/pdf'
  })

const text = (element: HTMLElement): string => element.textContent.replace(/\s/g, ' ')

describe('formatFileSize', () => {
  it.each([
    [0, '0 o'],
    [900, '900 o'],
    [1536, '1,5 Ko'],
    [1_572_864, '1,5 Mo'],
    [20 * 1024 * 1024, '20 Mo']
  ])('%i octets -> %s', (bytes, expected) => {
    expect(formatFileSize(bytes).replace(/\s/g, ' ')).toBe(expected)
  })
})

describe('AttachmentsPanel', () => {
  it('indique qu’aucun document n’est joint', async () => {
    installApiMock().listAttachments.mockResolvedValue(ok([]))
    render(<AttachmentsPanel ownerKind="PROCEDURE" ownerId="p1" />)
    expect(await screen.findByText('Aucun document joint.')).toBeDefined()
  })

  it('liste les documents avec type, taille lisible, date et note, pour l’objet demandé', async () => {
    const api = installApiMock()
    api.listAttachments.mockResolvedValue(ok([attachment()]))
    render(<AttachmentsPanel ownerKind="PROCEDURE" ownerId="p1" />)

    const row = (await screen.findAllByRole('row'))[1] as HTMLElement
    expect(text(row)).toContain('PV ouverture des plis.pdf')
    expect(text(row)).toContain('Original signé')
    expect(text(row)).toContain('PDF')
    expect(text(row)).toContain('1,5 Mo')
    expect(text(row)).toContain('04/10/2026')
    expect(api.listAttachments).toHaveBeenCalledWith({ ownerKind: 'PROCEDURE', ownerId: 'p1' })
  })

  it('le sélecteur n’accepte que les types autorisés, et le bouton reste inactif sans fichier', async () => {
    installApiMock()
    render(<AttachmentsPanel ownerKind="CONTRACT" ownerId="k1" />)
    const input = await screen.findByLabelText<HTMLInputElement>('Fichier à joindre')

    expect(input.accept).toBe(FILE_INPUT_ACCEPT)
    expect(
      screen.getByRole('button', { name: 'Joindre le document' }).hasAttribute('disabled')
    ).toBe(true)
  })

  it('joint un document : contenu, nom et note envoyés, ligne ajoutée, formulaire remis à zéro', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.listAttachments.mockResolvedValue(ok([]))
    api.addAttachment.mockResolvedValue(
      ok(attachment({ name: 'PV.pdf', size: 6, note: 'Version finale' }))
    )
    render(<AttachmentsPanel ownerKind="PROCEDURE" ownerId="p1" />)
    await screen.findByText('Aucun document joint.')

    await user.upload(screen.getByLabelText('Fichier à joindre'), pdf('PV.pdf'))
    await user.type(screen.getByLabelText('Note sur le document (facultative)'), ' Version finale ')
    await user.click(screen.getByRole('button', { name: 'Joindre le document' }))

    expect(api.addAttachment).toHaveBeenCalledTimes(1)
    const sent = api.addAttachment.mock.calls[0]?.[0]
    expect(sent).toMatchObject({
      ownerKind: 'PROCEDURE',
      ownerId: 'p1',
      fileName: 'PV.pdf',
      note: 'Version finale'
    })
    expect(Array.from(sent?.bytes ?? [])).toEqual([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])

    expect(await screen.findByText('Version finale', { selector: '.cell-note' })).toBeDefined()
    expect(
      screen.getByLabelText<HTMLInputElement>('Note sur le document (facultative)').value
    ).toBe('')
    expect(
      screen.getByRole('button', { name: 'Joindre le document' }).hasAttribute('disabled')
    ).toBe(true)
  })

  it('refuse un fichier trop gros sans l’envoyer', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    render(<AttachmentsPanel ownerKind="PROCEDURE" ownerId="p1" />)
    const big = pdf('énorme.pdf')
    Object.defineProperty(big, 'size', { value: MAX_ATTACHMENT_BYTES + 1 })

    await user.upload(await screen.findByLabelText('Fichier à joindre'), big)
    await user.click(screen.getByRole('button', { name: 'Joindre le document' }))

    expect((await screen.findByRole('alert')).textContent).toContain('taille maximale de 20 Mo')
    expect(api.addAttachment).not.toHaveBeenCalled()
  })

  it('affiche le refus du processus principal (type ou contenu non conforme)', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.addAttachment.mockResolvedValue(
      fail(
        'FILE_CONTENT_MISMATCH',
        'Le contenu du fichier ne correspond pas à son type : il est peut-être endommagé ou mal nommé.'
      )
    )
    render(<AttachmentsPanel ownerKind="PROCEDURE" ownerId="p1" />)

    await user.upload(await screen.findByLabelText('Fichier à joindre'), pdf('faux.pdf'))
    await user.click(screen.getByRole('button', { name: 'Joindre le document' }))

    expect((await screen.findByRole('alert')).textContent).toContain('ne correspond pas à son type')
  })

  it('demande une confirmation avant de retirer un document', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.listAttachments.mockResolvedValue(ok([attachment()]))
    render(<AttachmentsPanel ownerKind="PROCEDURE" ownerId="p1" />)

    await user.click(
      await screen.findByRole('button', { name: 'Retirer le document PV ouverture des plis.pdf' })
    )
    expect(api.removeAttachment).not.toHaveBeenCalled()
    await user.click(
      screen.getByRole('button', { name: 'Confirmer le retrait de PV ouverture des plis.pdf' })
    )

    expect(api.removeAttachment).toHaveBeenCalledWith({ attachmentId: 'a1' })
    expect(await screen.findByText('Aucun document joint.')).toBeDefined()
  })

  it('enregistre une copie, et confirme seulement si l’utilisateur a choisi un emplacement', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.listAttachments.mockResolvedValue(ok([attachment()]))
    api.exportAttachment
      .mockResolvedValueOnce(ok({ saved: false }))
      .mockResolvedValueOnce(ok({ saved: true }))
    render(<AttachmentsPanel ownerKind="PROCEDURE" ownerId="p1" />)
    const copy = await screen.findByRole('button', {
      name: 'Enregistrer une copie de PV ouverture des plis.pdf'
    })

    await user.click(copy)
    expect(api.exportAttachment).toHaveBeenCalledWith({ attachmentId: 'a1' })
    expect(screen.queryByText('Copie enregistrée.')).toBeNull() // fenêtre fermée sans choisir

    await user.click(copy)
    expect(await screen.findByText('Copie enregistrée.')).toBeDefined()
  })

  it('affiche l’erreur quand le document est illisible', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.listAttachments.mockResolvedValue(ok([attachment()]))
    api.exportAttachment.mockResolvedValue(
      fail(
        'ATTACHMENT_UNREADABLE',
        'Le document est introuvable, endommagé ou a été modifié : il ne peut pas être lu.'
      )
    )
    render(<AttachmentsPanel ownerKind="PROCEDURE" ownerId="p1" />)

    await user.click(await screen.findByRole('button', { name: /Enregistrer une copie de/ }))

    expect((await screen.findByRole('alert')).textContent).toContain('endommagé ou a été modifié')
  })
})
