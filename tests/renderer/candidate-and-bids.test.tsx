// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BidDto, CandidateDto, ProcedureDetailDto } from '@shared/api'
import { CandidateForm } from '../../src/renderer/src/screens/candidates/CandidateForm'
import { CandidateListScreen } from '../../src/renderer/src/screens/candidates/CandidateListScreen'
import { BidsPanel } from '../../src/renderer/src/screens/procedures/BidsPanel'
import { fail, installApiMock, ok } from './helpers'

afterEach(cleanup)

const candidate = (overrides: Partial<CandidateDto> = {}): CandidateDto => ({
  id: 'c1',
  name: 'SARL Alpha',
  nif: '1234567890',
  stat: null,
  address: 'Ankofafa, Fianarantsoa',
  phone: '034 00 000 00',
  email: 'alpha@example.mg',
  bidCount: 2,
  ...overrides
})

const bid = (overrides: Partial<BidDto> = {}): BidDto => ({
  id: 'b1',
  candidateId: 'c1',
  candidateName: 'SARL Alpha',
  amount: 900_000,
  awarded: false,
  ...overrides
})

const detail = (overrides: Partial<ProcedureDetailDto> = {}): ProcedureDetailDto => ({
  id: 'p1',
  reference: 'DAO-001/2026',
  object: 'Fourniture de mobilier',
  method: 'DAO',
  estimatedAmount: null,
  createdOn: '2026-10-04',
  validatedCount: 0,
  totalSteps: 5,
  status: 'NOT_STARTED',
  nextStep: 'PUBLICATION',
  awardedCandidate: null,
  ppmLine: null,
  steps: [],
  bids: [],
  bidsLocked: false,
  ...overrides
})

const text = (element: HTMLElement): string => element.textContent.replace(/\s/g, ' ')

describe('CandidateListScreen', () => {
  it('propose de créer le premier candidat quand la liste est vide', async () => {
    const user = userEvent.setup()
    installApiMock().listCandidates.mockResolvedValue(ok([]))
    const onCreate = vi.fn()
    render(<CandidateListScreen onCreate={onCreate} onEdit={vi.fn()} />)

    expect(await screen.findByText('Aucun candidat enregistré pour cette région.')).toBeDefined()
    await user.click(screen.getByRole('button', { name: 'Nouveau candidat' }))
    expect(onCreate).toHaveBeenCalled()
  })

  it('liste les candidats avec leurs identifiants, contacts et nombre d’offres', async () => {
    installApiMock().listCandidates.mockResolvedValue(
      ok([
        candidate(),
        candidate({
          id: 'c2',
          name: 'Beta',
          nif: null,
          phone: null,
          email: null,
          address: null,
          bidCount: 0
        })
      ])
    )
    render(<CandidateListScreen onCreate={vi.fn()} onEdit={vi.fn()} />)

    const rows = await screen.findAllByRole('row')
    expect(text(rows[1] as HTMLElement)).toContain('SARL Alpha')
    expect(text(rows[1] as HTMLElement)).toContain('1234567890')
    expect(text(rows[1] as HTMLElement)).toContain('alpha@example.mg')
    expect(text(rows[1] as HTMLElement)).toContain('2')
    expect(text(rows[2] as HTMLElement)).toContain('—')
  })

  it('transmet le candidat à modifier', async () => {
    const user = userEvent.setup()
    installApiMock().listCandidates.mockResolvedValue(ok([candidate()]))
    const onEdit = vi.fn()
    render(<CandidateListScreen onCreate={vi.fn()} onEdit={onEdit} />)

    await user.click(await screen.findByRole('button', { name: 'Modifier SARL Alpha' }))

    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }))
  })

  it('demande une confirmation, puis retire le candidat de la liste', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.listCandidates.mockResolvedValue(ok([candidate({ bidCount: 0 })]))
    render(<CandidateListScreen onCreate={vi.fn()} onEdit={vi.fn()} />)

    await user.click(await screen.findByRole('button', { name: 'Supprimer SARL Alpha' }))
    expect(api.deleteCandidate).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Confirmer la suppression de SARL Alpha' }))

    expect(api.deleteCandidate).toHaveBeenCalledWith({ candidateId: 'c1' })
    expect(await screen.findByText('Aucun candidat enregistré pour cette région.')).toBeDefined()
  })

  it('affiche le motif quand la suppression est refusée, et garde le candidat', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.listCandidates.mockResolvedValue(ok([candidate()]))
    api.deleteCandidate.mockResolvedValue(
      fail(
        'CANDIDATE_IN_USE',
        'Ce candidat a déposé une offre ou détient un contrat : il ne peut pas être supprimé.'
      )
    )
    render(<CandidateListScreen onCreate={vi.fn()} onEdit={vi.fn()} />)

    await user.click(await screen.findByRole('button', { name: 'Supprimer SARL Alpha' }))
    await user.click(screen.getByRole('button', { name: 'Confirmer la suppression de SARL Alpha' }))

    expect((await screen.findByRole('alert')).textContent).toContain('a déposé une offre')
    expect(screen.getByRole('button', { name: 'Modifier SARL Alpha' })).toBeDefined()
  })
})

describe('CandidateForm', () => {
  it('crée un candidat : champs vides envoyés en null', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.createCandidate.mockResolvedValue(ok(candidate()))
    const onSaved = vi.fn()
    render(<CandidateForm candidate={null} onSaved={onSaved} onCancel={vi.fn()} />)

    await user.type(screen.getByLabelText('Nom du candidat'), 'SARL Alpha')
    await user.type(screen.getByLabelText('NIF'), '1234567890')
    await user.type(screen.getByLabelText('Téléphone'), '034 00 000 00')
    await user.click(screen.getByRole('button', { name: 'Créer le candidat' }))

    expect(api.createCandidate).toHaveBeenCalledWith({
      name: 'SARL Alpha',
      nif: '1234567890',
      stat: null,
      address: null,
      phone: '034 00 000 00',
      email: null
    })
    expect(onSaved).toHaveBeenCalled()
  })

  it('préremplit un candidat existant et l’enregistre avec son identifiant', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.updateCandidate.mockResolvedValue(ok(candidate()))
    render(<CandidateForm candidate={candidate()} onSaved={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.getByLabelText<HTMLInputElement>('Courriel').value).toBe('alpha@example.mg')
    await user.clear(screen.getByLabelText('Nom du candidat'))
    await user.type(screen.getByLabelText('Nom du candidat'), 'SARL Alpha Plus')
    await user.click(screen.getByRole('button', { name: 'Enregistrer les modifications' }))

    expect(api.updateCandidate).toHaveBeenCalledWith(
      expect.objectContaining({ candidateId: 'c1', name: 'SARL Alpha Plus', stat: null })
    )
  })

  it('affiche l’erreur (NIF déjà utilisé) et reste sur le formulaire', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.createCandidate.mockResolvedValue(
      fail('DUPLICATE_NIF', 'Un candidat est déjà enregistré avec le NIF « 1 ».')
    )
    const onSaved = vi.fn()
    render(<CandidateForm candidate={null} onSaved={onSaved} onCancel={vi.fn()} />)
    await user.type(screen.getByLabelText('Nom du candidat'), 'X')

    await user.click(screen.getByRole('button', { name: 'Créer le candidat' }))

    expect((await screen.findByRole('alert')).textContent).toContain('déjà enregistré avec le NIF')
    expect(onSaved).not.toHaveBeenCalled()
  })
})

describe('BidsPanel', () => {
  const setup = (
    procedure: ProcedureDetailDto,
    candidates: readonly CandidateDto[] = [
      candidate(),
      candidate({ id: 'c2', name: 'Beta', nif: '555', bidCount: 0 })
    ]
  ): { api: ReturnType<typeof installApiMock>; onChange: ReturnType<typeof vi.fn> } => {
    const api = installApiMock()
    api.listCandidates.mockResolvedValue(ok(candidates))
    const onChange = vi.fn()
    render(<BidsPanel detail={procedure} onChange={onChange} />)
    return { api, onChange }
  }

  it('indique qu’il n’y a aucune offre, et propose les candidats enregistrés', async () => {
    setup(detail())
    expect(await screen.findByText('Aucune offre enregistrée pour cette procédure.')).toBeDefined()
    expect(await screen.findByRole('option', { name: 'SARL Alpha' })).toBeDefined()
  })

  it('n’offre plus de choisir un candidat qui a déjà déposé une offre', async () => {
    setup(detail({ bids: [bid()] }))
    await screen.findByRole('option', { name: 'Beta' })
    expect(screen.queryByRole('option', { name: 'SARL Alpha' })).toBeNull()
  })

  it('renvoie vers le menu Candidats quand aucun candidat n’existe', async () => {
    setup(detail(), [])
    expect(
      await screen.findByText(/Aucun candidat enregistré : créez-en dans le menu Candidats/)
    ).toBeDefined()
  })

  it('ajoute une offre avec le montant saisi puis prévient la page', async () => {
    const user = userEvent.setup()
    const updated = detail({ bids: [bid({ amount: 1_500_000 })] })
    const { api, onChange } = setup(detail())
    api.addBid.mockResolvedValue(ok(updated))
    await screen.findByRole('option', { name: 'SARL Alpha' })

    await user.selectOptions(screen.getByLabelText('Candidat'), 'SARL Alpha')
    await user.type(screen.getByLabelText('Montant de l’offre (Ar)'), '1 500 000')
    await user.click(screen.getByRole('button', { name: 'Ajouter l’offre' }))

    expect(api.addBid).toHaveBeenCalledWith({
      procedureId: 'p1',
      candidateId: 'c1',
      amount: 1_500_000
    })
    expect(onChange).toHaveBeenCalledWith(updated)
  })

  it('refuse un montant illisible sans appeler le processus principal', async () => {
    const user = userEvent.setup()
    const { api } = setup(detail())
    await screen.findByRole('option', { name: 'SARL Alpha' })

    await user.selectOptions(screen.getByLabelText('Candidat'), 'SARL Alpha')
    await user.type(screen.getByLabelText('Montant de l’offre (Ar)'), 'beaucoup')
    await user.click(screen.getByRole('button', { name: 'Ajouter l’offre' }))

    expect((await screen.findByRole('alert')).textContent).toContain(
      'montant de l’offre est invalide'
    )
    expect(api.addBid).not.toHaveBeenCalled()
  })

  it('retient une offre', async () => {
    const user = userEvent.setup()
    const { api, onChange } = setup(detail({ bids: [bid()] }))
    api.setAward.mockResolvedValue(
      ok(detail({ bids: [bid({ awarded: true })], awardedCandidate: 'SARL Alpha' }))
    )

    await user.click(await screen.findByRole('button', { name: 'Retenir l’offre de SARL Alpha' }))

    expect(api.setAward).toHaveBeenCalledWith({ procedureId: 'p1', bidId: 'b1' })
    expect(onChange).toHaveBeenCalled()
  })

  it('affiche l’offre retenue et propose de ne plus la retenir', async () => {
    const user = userEvent.setup()
    const { api } = setup(detail({ bids: [bid({ awarded: true })] }))
    api.setAward.mockResolvedValue(ok(detail({ bids: [bid()] })))

    expect(await screen.findByText('Offre retenue')).toBeDefined()
    await user.click(
      screen.getByRole('button', { name: 'Retirer la désignation de l’offre de SARL Alpha' })
    )

    expect(api.setAward).toHaveBeenCalledWith({ procedureId: 'p1', bidId: null })
  })

  it('modifie le montant d’une offre, prérempli et formaté', async () => {
    const user = userEvent.setup()
    const { api } = setup(detail({ bids: [bid()] }))
    api.updateBid.mockResolvedValue(ok(detail({ bids: [bid({ amount: 750_000 })] })))

    await user.click(
      await screen.findByRole('button', { name: 'Modifier le montant de l’offre de SARL Alpha' })
    )
    const field = screen.getByLabelText<HTMLInputElement>(
      'Nouveau montant de l’offre de SARL Alpha'
    )
    expect(field.value.replace(/\s/g, '')).toBe('900000')
    await user.clear(field)
    await user.type(field, '750000')
    await user.click(screen.getByRole('button', { name: 'Enregistrer le montant' }))

    expect(api.updateBid).toHaveBeenCalledWith({ procedureId: 'p1', bidId: 'b1', amount: 750_000 })
  })

  it('demande une confirmation avant de retirer une offre', async () => {
    const user = userEvent.setup()
    const { api } = setup(detail({ bids: [bid()] }))
    api.removeBid.mockResolvedValue(ok(detail()))

    await user.click(await screen.findByRole('button', { name: 'Retirer l’offre de SARL Alpha' }))
    expect(api.removeBid).not.toHaveBeenCalled()
    await user.click(
      screen.getByRole('button', { name: 'Confirmer le retrait de l’offre de SARL Alpha' })
    )

    expect(api.removeBid).toHaveBeenCalledWith({ procedureId: 'p1', bidId: 'b1' })
  })

  it('affiche le motif d’un refus (offre déjà déposée) sans modifier la page', async () => {
    const user = userEvent.setup()
    const { api, onChange } = setup(detail())
    api.addBid.mockResolvedValue(
      fail('DUPLICATE_BID', 'Ce candidat a déjà déposé une offre pour cette procédure.')
    )
    await screen.findByRole('option', { name: 'SARL Alpha' })

    await user.selectOptions(screen.getByLabelText('Candidat'), 'SARL Alpha')
    await user.type(screen.getByLabelText('Montant de l’offre (Ar)'), '100')
    await user.click(screen.getByRole('button', { name: 'Ajouter l’offre' }))

    expect((await screen.findByRole('alert')).textContent).toContain('déjà déposé une offre')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('verrouille tout après la validation de l’attribution : message, boutons inactifs, ajout masqué', async () => {
    setup(detail({ bidsLocked: true, bids: [bid({ awarded: true })] }))

    expect(
      await screen.findByText(
        /L’attribution est validée : les offres ne peuvent plus être modifiées/
      )
    ).toBeDefined()
    expect(
      screen
        .getByRole('button', { name: 'Retirer la désignation de l’offre de SARL Alpha' })
        .hasAttribute('disabled')
    ).toBe(true)
    expect(
      screen
        .getByRole('button', { name: 'Modifier le montant de l’offre de SARL Alpha' })
        .hasAttribute('disabled')
    ).toBe(true)
    expect(
      screen.getByRole('button', { name: 'Retirer l’offre de SARL Alpha' }).hasAttribute('disabled')
    ).toBe(true)
    expect(screen.queryByRole('button', { name: 'Ajouter l’offre' })).toBeNull()
  })
})
