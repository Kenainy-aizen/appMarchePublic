// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PpmDetailDto, PpmLineDto, PpmSummaryDto } from '@shared/api'
import { PpmDetailScreen } from '../../src/renderer/src/screens/ppm/PpmDetailScreen'
import { PpmLineForm } from '../../src/renderer/src/screens/ppm/PpmLineForm'
import { PpmListScreen } from '../../src/renderer/src/screens/ppm/PpmListScreen'
import { fail, installApiMock, ok } from './helpers'

afterEach(cleanup)

const line = (overrides: Partial<PpmLineDto> = {}): PpmLineDto => ({
  id: 'l1',
  nature: 'TRAVAUX',
  object: 'Réhabilitation des bureaux',
  financing: 'Budget de l’État',
  accounts: ['6012', '6013'],
  plannedLaunchDate: '2026-03-01',
  plannedBidOpeningDate: '2026-04-01',
  plannedAwardDate: null,
  beneficiaries: [
    { service: 'SRH', amount: 1_000_000 },
    { service: 'SAF', amount: 500_000 }
  ],
  method: 'AOR',
  procedureLead: 'M. Rakoto',
  total: 1_500_000,
  ...overrides
})

const detail = (overrides: Partial<PpmDetailDto> = {}): PpmDetailDto => ({
  id: 'p1',
  year: 2026,
  number: 1,
  elaboratedOn: '2026-01-10',
  lastUpdateOn: null,
  updateCount: 0,
  lineCount: 1,
  total: 1_500_000,
  lines: [line()],
  ...overrides
})

const summary = (overrides: Partial<PpmSummaryDto> = {}): PpmSummaryDto => ({
  id: 'p1',
  year: 2026,
  number: 1,
  elaboratedOn: '2026-01-10',
  lastUpdateOn: null,
  updateCount: 0,
  lineCount: 2,
  total: 1_500_000,
  ...overrides
})

const text = (element: HTMLElement): string => element.textContent.replace(/\s/g, ' ')

describe('PpmListScreen', () => {
  it('affiche un message quand il n’y a aucun plan', async () => {
    installApiMock().listPpms.mockResolvedValue(ok([]))
    render(<PpmListScreen onOpen={vi.fn()} />)
    expect(await screen.findByText('Aucun plan de passation pour cette région.')).toBeDefined()
  })

  it('liste les plans avec leurs montants et ouvre celui choisi', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.listPpms.mockResolvedValue(
      ok([summary(), summary({ id: 'p2', number: 2, updateCount: 3, lastUpdateOn: '2026-06-30' })])
    )
    const onOpen = vi.fn()
    render(<PpmListScreen onOpen={onOpen} />)

    const rows = await screen.findAllByRole('row')
    expect(text(rows[1] as HTMLElement)).toContain('1 500 000 Ar')
    expect(text(rows[2] as HTMLElement)).toContain('30/06/2026 (mise à jour n° 3)')

    await user.click(screen.getByRole('button', { name: 'Ouvrir le plan n° 2 de 2026' }))
    expect(onOpen).toHaveBeenCalledWith('p2')
  })

  it('crée un plan avec l’année et la date saisies, puis l’ouvre', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.listPpms.mockResolvedValue(ok([]))
    api.createPpm.mockResolvedValue(ok(detail({ id: 'nouveau', lineCount: 0, lines: [] })))
    const onOpen = vi.fn()
    render(<PpmListScreen onOpen={onOpen} />)
    await screen.findByText('Aucun plan de passation pour cette région.')

    await user.clear(screen.getByLabelText('Année'))
    await user.type(screen.getByLabelText('Année'), '2027')
    fireEvent.change(screen.getByLabelText('Date d’élaboration'), {
      target: { value: '2027-01-05' }
    })
    await user.click(screen.getByRole('button', { name: 'Créer le plan' }))

    expect(api.createPpm).toHaveBeenCalledWith({ year: 2027, elaboratedOn: '2027-01-05' })
    expect(onOpen).toHaveBeenCalledWith('nouveau')
  })

  it('affiche l’erreur de création sans ouvrir de plan', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.listPpms.mockResolvedValue(ok([]))
    api.createPpm.mockResolvedValue(fail('NO_ACTIVE_REGION', 'Aucune région n’est ouverte.'))
    const onOpen = vi.fn()
    render(<PpmListScreen onOpen={onOpen} />)
    await screen.findByText('Aucun plan de passation pour cette région.')

    await user.click(screen.getByRole('button', { name: 'Créer le plan' }))

    expect((await screen.findByRole('alert')).textContent).toBe('Aucune région n’est ouverte.')
    expect(onOpen).not.toHaveBeenCalled()
  })
})

describe('PpmDetailScreen', () => {
  const renderDetail = (): {
    onEditLine: ReturnType<typeof vi.fn>
    onBack: ReturnType<typeof vi.fn>
  } => {
    const onEditLine = vi.fn()
    const onBack = vi.fn()
    render(<PpmDetailScreen ppmId="p1" onEditLine={onEditLine} onBack={onBack} />)
    return { onEditLine, onBack }
  }

  it('affiche l’entête, les lignes, leurs libellés français et le total', async () => {
    installApiMock().getPpm.mockResolvedValue(ok(detail()))
    renderDetail()

    expect(
      await screen.findByRole('heading', { name: 'Plan de passation n° 1 — 2026' })
    ).toBeDefined()
    const row = screen.getAllByRole('row')[1] as HTMLElement
    expect(text(row)).toContain('Travaux')
    expect(text(row)).toContain('Appel d’offres restreint (AOR)')
    expect(text(row)).toContain('01/03/2026')
    expect(text(row)).toContain('SRH, SAF')
    expect(text(screen.getAllByRole('row').at(-1) as HTMLElement)).toContain('1 500 000 Ar')
  })

  it('propose d’ajouter une ligne et de modifier une ligne existante', async () => {
    const user = userEvent.setup()
    installApiMock().getPpm.mockResolvedValue(ok(detail()))
    const { onEditLine } = renderDetail()
    await screen.findByRole('heading', { name: /Plan de passation n° 1/ })

    await user.click(screen.getByRole('button', { name: 'Ajouter une ligne' }))
    expect(onEditLine).toHaveBeenLastCalledWith(null)

    await user.click(screen.getByRole('button', { name: 'Modifier la ligne 1' }))
    expect(onEditLine).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'l1' }))
  })

  it('enregistre une mise à jour et affiche le nouveau numéro', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.getPpm.mockResolvedValue(ok(detail()))
    api.recordPpmUpdate.mockResolvedValue(
      ok(detail({ updateCount: 1, lastUpdateOn: '2026-10-04' }))
    )
    renderDetail()
    await screen.findByRole('heading', { name: /Plan de passation n° 1/ })

    await user.click(screen.getByRole('button', { name: 'Enregistrer une mise à jour' }))

    expect(await screen.findByText('04/10/2026 (n° 1)')).toBeDefined()
    expect(api.recordPpmUpdate).toHaveBeenCalledWith({ ppmId: 'p1' })
  })

  it('demande une confirmation avant de supprimer une ligne, et permet d’annuler', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.getPpm.mockResolvedValue(ok(detail()))
    api.removePpmLine.mockResolvedValue(ok(detail({ lineCount: 0, total: 0, lines: [] })))
    renderDetail()
    await screen.findByRole('heading', { name: /Plan de passation n° 1/ })

    await user.click(screen.getByRole('button', { name: 'Supprimer la ligne 1' }))
    expect(api.removePpmLine).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(screen.getByRole('button', { name: 'Supprimer la ligne 1' })).toBeDefined()
    expect(api.removePpmLine).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Supprimer la ligne 1' }))
    await user.click(screen.getByRole('button', { name: 'Confirmer la suppression de la ligne 1' }))

    expect(api.removePpmLine).toHaveBeenCalledWith({ ppmId: 'p1', lineId: 'l1' })
    expect(await screen.findByText('Ce plan ne contient encore aucune ligne.')).toBeDefined()
  })

  it('affiche le motif quand la suppression d’une ligne est refusée', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.getPpm.mockResolvedValue(ok(detail()))
    api.removePpmLine.mockResolvedValue(
      fail('PPM_LINE_IN_USE', 'Cette ligne est utilisée par une procédure ou un contrat.')
    )
    renderDetail()
    await screen.findByRole('heading', { name: /Plan de passation n° 1/ })

    await user.click(screen.getByRole('button', { name: 'Supprimer la ligne 1' }))
    await user.click(screen.getByRole('button', { name: 'Confirmer la suppression de la ligne 1' }))

    expect((await screen.findByRole('alert')).textContent).toContain('utilisée par une procédure')
    expect(screen.getByRole('button', { name: 'Modifier la ligne 1' })).toBeDefined() // la ligne est toujours là
  })

  it('supprime le plan après confirmation puis revient à la liste', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.getPpm.mockResolvedValue(ok(detail()))
    const { onBack } = renderDetail()
    await screen.findByRole('heading', { name: /Plan de passation n° 1/ })

    await user.click(screen.getByRole('button', { name: 'Supprimer ce plan' }))
    expect(api.deletePpm).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Confirmer la suppression du plan' }))

    expect(api.deletePpm).toHaveBeenCalledWith({ ppmId: 'p1' })
    expect(onBack).toHaveBeenCalled()
  })

  it('signale un plan introuvable avec un retour possible', async () => {
    installApiMock().getPpm.mockResolvedValue(
      fail('PPM_NOT_FOUND', 'Ce plan de passation n’existe pas.')
    )
    const { onBack } = renderDetail()
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Ce plan de passation n’existe pas.'
    )
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retour à la liste' }))
    expect(onBack).toHaveBeenCalled()
  })
})

describe('PpmLineForm', () => {
  const renderForm = (
    existing: PpmLineDto | null = null
  ): { onSaved: ReturnType<typeof vi.fn>; onCancel: ReturnType<typeof vi.fn> } => {
    const onSaved = vi.fn()
    const onCancel = vi.fn()
    render(<PpmLineForm ppmId="p1" line={existing} onSaved={onSaved} onCancel={onCancel} />)
    return { onSaved, onCancel }
  }

  it('envoie une nouvelle ligne : comptes découpés, vides en null, montants lus, total en direct', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.savePpmLine.mockResolvedValue(ok(detail()))
    const { onSaved } = renderForm()

    await user.selectOptions(screen.getByLabelText('Nature du marché'), 'Fournitures')
    await user.type(screen.getByLabelText('Objet'), '  Achat de mobilier ')
    await user.type(screen.getByLabelText('Comptes (séparés par une virgule)'), '6012, 6013')
    await user.selectOptions(
      screen.getByLabelText('Mode de passation'),
      'Consultation de prix (DCP)'
    )
    fireEvent.change(screen.getByLabelText('Lancement'), { target: { value: '2026-03-01' } })

    await user.click(screen.getByRole('button', { name: 'Ajouter un service' }))
    await user.type(screen.getByLabelText('Service bénéficiaire 1'), 'SRH')
    await user.type(screen.getByLabelText('Montant du service 1 (Ar)'), '1 500 000')
    await user.click(screen.getByRole('button', { name: 'Ajouter un service' }))
    await user.type(screen.getByLabelText('Service bénéficiaire 2'), 'SAF')
    await user.type(screen.getByLabelText('Montant du service 2 (Ar)'), '250000')

    expect(text(screen.getByRole('status'))).toContain('1 750 000 Ar')

    await user.click(screen.getByRole('button', { name: 'Enregistrer la ligne' }))

    expect(api.savePpmLine).toHaveBeenCalledWith({
      ppmId: 'p1',
      lineId: null,
      nature: 'FOURNITURES',
      object: '  Achat de mobilier ',
      financing: null,
      accounts: ['6012', '6013'],
      plannedLaunchDate: '2026-03-01',
      plannedBidOpeningDate: null,
      plannedAwardDate: null,
      beneficiaries: [
        { service: 'SRH', amount: 1_500_000 },
        { service: 'SAF', amount: 250_000 }
      ],
      method: 'DCP',
      procedureLead: null
    })
    expect(onSaved).toHaveBeenCalled()
  })

  it('préremplit une ligne existante et la renvoie avec son identifiant', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.savePpmLine.mockResolvedValue(ok(detail()))
    renderForm(line())

    expect(screen.getByLabelText<HTMLTextAreaElement>('Objet').value).toBe(
      'Réhabilitation des bureaux'
    )
    expect(screen.getByLabelText<HTMLInputElement>('Comptes (séparés par une virgule)').value).toBe(
      '6012, 6013'
    )
    expect(screen.getByLabelText<HTMLInputElement>('Service bénéficiaire 2').value).toBe('SAF')
    expect(text(screen.getByRole('status'))).toContain('1 500 000 Ar')

    await user.click(screen.getByRole('button', { name: 'Enregistrer la ligne' }))

    expect(api.savePpmLine).toHaveBeenCalledWith(
      expect.objectContaining({
        lineId: 'l1',
        nature: 'TRAVAUX',
        method: 'AOR',
        beneficiaries: [
          { service: 'SRH', amount: 1_000_000 },
          { service: 'SAF', amount: 500_000 }
        ]
      })
    )
  })

  it('refuse un montant illisible sans appeler le processus principal', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    const { onSaved } = renderForm()
    await user.type(screen.getByLabelText('Objet'), 'Achat')
    await user.click(screen.getByRole('button', { name: 'Ajouter un service' }))
    await user.type(screen.getByLabelText('Service bénéficiaire 1'), 'SRH')
    await user.type(screen.getByLabelText('Montant du service 1 (Ar)'), '12,5 millions')

    await user.click(screen.getByRole('button', { name: 'Enregistrer la ligne' }))

    expect((await screen.findByRole('alert')).textContent).toContain(
      'montant du service 1 est invalide'
    )
    expect(api.savePpmLine).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('ignore une ligne de service entièrement vide', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.savePpmLine.mockResolvedValue(ok(detail()))
    renderForm()
    await user.type(screen.getByLabelText('Objet'), 'Achat')
    await user.click(screen.getByRole('button', { name: 'Ajouter un service' }))

    await user.click(screen.getByRole('button', { name: 'Enregistrer la ligne' }))

    expect(api.savePpmLine).toHaveBeenCalledWith(expect.objectContaining({ beneficiaries: [] }))
  })

  it('retire un service et met le total à jour', async () => {
    const user = userEvent.setup()
    installApiMock()
    renderForm(line())

    await user.click(screen.getByRole('button', { name: 'Retirer le service 1' }))

    expect(text(screen.getByRole('status'))).toContain('500 000 Ar')
    expect(screen.queryByLabelText('Service bénéficiaire 2')).toBeNull()
  })

  it('affiche l’erreur métier et reste sur le formulaire', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.savePpmLine.mockResolvedValue(
      fail('INCONSISTENT_PLANNED_DATES', 'Les dates prévisionnelles doivent suivre l’ordre.')
    )
    const { onSaved } = renderForm()
    await user.type(screen.getByLabelText('Objet'), 'Achat')

    await user.click(screen.getByRole('button', { name: 'Enregistrer la ligne' }))

    const alert = await screen.findByRole('alert')
    expect(
      within(alert.parentElement as HTMLElement).getByRole('button', {
        name: 'Enregistrer la ligne'
      })
    ).toBeDefined()
    expect(alert.textContent).toBe('Les dates prévisionnelles doivent suivre l’ordre.')
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('annule sans rien enregistrer', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    const { onCancel } = renderForm()
    await user.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(onCancel).toHaveBeenCalled()
    expect(api.savePpmLine).not.toHaveBeenCalled()
  })
})
