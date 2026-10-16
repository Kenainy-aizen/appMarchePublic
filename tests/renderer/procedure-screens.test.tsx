// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  PpmLineChoiceDto,
  ProcedureDetailDto,
  ProcedureStepDto,
  ProcedureSummaryDto
} from '@shared/api'
import { ProcedureDetailScreen } from '../../src/renderer/src/screens/procedures/ProcedureDetailScreen'
import { ProcedureForm } from '../../src/renderer/src/screens/procedures/ProcedureForm'
import { ProcedureListScreen } from '../../src/renderer/src/screens/procedures/ProcedureListScreen'
import { fail, installApiMock, ok } from './helpers'

afterEach(cleanup)

const step = (kind: string, overrides: Partial<ProcedureStepDto> = {}): ProcedureStepDto => ({
  kind,
  plannedDate: null,
  actualDate: null,
  validatedOn: null,
  ...overrides
})

const KINDS = ['PUBLICATION', 'OUVERTURE_PLIS', 'EVALUATION', 'ATTRIBUTION', 'APPROBATION']

const detail = (overrides: Partial<ProcedureDetailDto> = {}): ProcedureDetailDto => ({
  id: 'p1',
  reference: 'DAO-001/2026',
  object: 'Fourniture de mobilier',
  method: 'DAO',
  estimatedAmount: 1_500_000,
  createdOn: '2026-10-04',
  validatedCount: 0,
  totalSteps: 5,
  status: 'NOT_STARTED',
  nextStep: 'PUBLICATION',
  ppmLine: null,
  steps: KINDS.map((kind) => step(kind)),
  ...overrides
})

/** Procédure dont les `count` premières étapes sont validées (avec date réelle). */
const progressed = (count: number): ProcedureDetailDto =>
  detail({
    validatedCount: count,
    status: count === 0 ? 'NOT_STARTED' : count === 5 ? 'COMPLETED' : 'IN_PROGRESS',
    nextStep: KINDS[count] ?? null,
    steps: KINDS.map((kind, index) =>
      index < count
        ? step(kind, { actualDate: '2026-03-10', validatedOn: '2026-03-12' })
        : step(kind)
    )
  })

const summary = (overrides: Partial<ProcedureSummaryDto> = {}): ProcedureSummaryDto => ({
  id: 'p1',
  reference: 'DAO-001/2026',
  object: 'Fourniture de mobilier',
  method: 'DAO',
  estimatedAmount: 1_500_000,
  createdOn: '2026-10-04',
  validatedCount: 2,
  totalSteps: 5,
  status: 'IN_PROGRESS',
  nextStep: 'EVALUATION',
  ...overrides
})

const text = (element: HTMLElement): string => element.textContent.replace(/\s/g, ' ')

describe('ProcedureListScreen', () => {
  it('propose de créer la première procédure quand la liste est vide', async () => {
    const user = userEvent.setup()
    installApiMock().listProcedures.mockResolvedValue(ok([]))
    const onCreate = vi.fn()
    render(<ProcedureListScreen onOpen={vi.fn()} onCreate={onCreate} />)

    expect(
      await screen.findByText('Aucune procédure de passation pour cette région.')
    ).toBeDefined()
    await user.click(screen.getByRole('button', { name: 'Nouvelle procédure' }))
    expect(onCreate).toHaveBeenCalled()
  })

  it('liste les procédures avec leur avancement et ouvre celle choisie', async () => {
    const user = userEvent.setup()
    installApiMock().listProcedures.mockResolvedValue(
      ok([
        summary(),
        summary({
          id: 'p2',
          reference: 'AOR-002/2026',
          validatedCount: 0,
          status: 'NOT_STARTED',
          estimatedAmount: null
        })
      ])
    )
    const onOpen = vi.fn()
    render(<ProcedureListScreen onOpen={onOpen} onCreate={vi.fn()} />)

    const rows = await screen.findAllByRole('row')
    expect(text(rows[1] as HTMLElement)).toContain('2 sur 5 — En cours')
    expect(text(rows[1] as HTMLElement)).toContain('1 500 000 Ar')
    expect(text(rows[1] as HTMLElement)).toContain('Appel d’offres ouvert (DAO)')
    expect(text(rows[2] as HTMLElement)).toContain('0 sur 5 — Non démarrée')
    expect(text(rows[2] as HTMLElement)).toContain('—')

    await user.click(screen.getByRole('button', { name: 'Ouvrir la procédure AOR-002/2026' }))
    expect(onOpen).toHaveBeenCalledWith('p2')
  })

  it('affiche l’erreur de chargement', async () => {
    installApiMock().listProcedures.mockResolvedValue(
      fail('NO_ACTIVE_REGION', 'Aucune région n’est ouverte.')
    )
    render(<ProcedureListScreen onOpen={vi.fn()} onCreate={vi.fn()} />)
    expect((await screen.findByRole('alert')).textContent).toBe('Aucune région n’est ouverte.')
  })
})

describe('ProcedureForm', () => {
  const line: PpmLineChoiceDto = {
    ppmId: 'ppm1',
    ppmNumber: 1,
    ppmYear: 2026,
    lineId: 'l1',
    object: 'Achat de mobilier',
    total: 1_500_000,
    nature: 'FOURNITURES',
    method: 'AOR'
  }

  it('crée une procédure avec les valeurs saisies', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.createProcedure.mockResolvedValue(ok(detail()))
    const onSaved = vi.fn()
    render(<ProcedureForm procedure={null} onSaved={onSaved} onCancel={vi.fn()} />)

    await user.type(screen.getByLabelText('Référence'), 'DAO-001/2026')
    await user.type(screen.getByLabelText('Objet'), 'Fourniture de mobilier')
    await user.selectOptions(
      screen.getByLabelText('Mode de passation'),
      'Consultation de prix (DCP)'
    )
    await user.type(screen.getByLabelText('Montant estimé (Ar)'), '1 500 000')
    await user.click(screen.getByRole('button', { name: 'Créer la procédure' }))

    expect(api.createProcedure).toHaveBeenCalledWith({
      reference: 'DAO-001/2026',
      object: 'Fourniture de mobilier',
      method: 'DCP',
      ppmLineId: null,
      estimatedAmount: 1_500_000
    })
    expect(onSaved).toHaveBeenCalledWith('p1')
  })

  it('choisir une ligne du plan préremplit objet, mode et montant, sans écraser une saisie', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.listPpmLines.mockResolvedValue(ok([line]))
    render(<ProcedureForm procedure={null} onSaved={vi.fn()} onCancel={vi.fn()} />)
    await screen.findByRole('option', { name: /Plan n° 1 \(2026\) : Achat de mobilier/ })

    await user.selectOptions(screen.getByLabelText('Ligne du plan de passation'), 'l1')

    expect(screen.getByLabelText<HTMLTextAreaElement>('Objet').value).toBe('Achat de mobilier')
    expect(screen.getByLabelText<HTMLSelectElement>('Mode de passation').value).toBe('AOR')
    expect(
      screen.getByLabelText<HTMLInputElement>('Montant estimé (Ar)').value.replace(/\s/g, '')
    ).toBe('1500000')
  })

  it('ne remplace pas un objet déjà saisi', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.listPpmLines.mockResolvedValue(ok([line]))
    render(<ProcedureForm procedure={null} onSaved={vi.fn()} onCancel={vi.fn()} />)
    await screen.findByRole('option', { name: /Achat de mobilier/ })
    await user.type(screen.getByLabelText('Objet'), 'Mon objet')

    await user.selectOptions(screen.getByLabelText('Ligne du plan de passation'), 'l1')

    expect(screen.getByLabelText<HTMLTextAreaElement>('Objet').value).toBe('Mon objet')
  })

  it('refuse un montant illisible sans appeler le processus principal', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    render(<ProcedureForm procedure={null} onSaved={vi.fn()} onCancel={vi.fn()} />)
    await user.type(screen.getByLabelText('Référence'), 'R')
    await user.type(screen.getByLabelText('Objet'), 'O')
    await user.type(screen.getByLabelText('Montant estimé (Ar)'), 'beaucoup')

    await user.click(screen.getByRole('button', { name: 'Créer la procédure' }))

    expect((await screen.findByRole('alert')).textContent).toContain('montant estimé est invalide')
    expect(api.createProcedure).not.toHaveBeenCalled()
  })

  it('affiche l’erreur métier (référence déjà utilisée) et reste sur le formulaire', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.createProcedure.mockResolvedValue(
      fail('DUPLICATE_REFERENCE', 'Une procédure porte déjà la référence « R ».')
    )
    const onSaved = vi.fn()
    render(<ProcedureForm procedure={null} onSaved={onSaved} onCancel={vi.fn()} />)
    await user.type(screen.getByLabelText('Référence'), 'R')
    await user.type(screen.getByLabelText('Objet'), 'O')

    await user.click(screen.getByRole('button', { name: 'Créer la procédure' }))

    expect((await screen.findByRole('alert')).textContent).toContain('déjà la référence')
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('modifie une procédure existante ; le mode est verrouillé si une étape est validée', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.updateProcedure.mockResolvedValue(ok(progressed(1)))
    render(<ProcedureForm procedure={progressed(1)} onSaved={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.getByLabelText<HTMLSelectElement>('Mode de passation').disabled).toBe(true)
    expect(screen.getByText(/ne peut plus être modifié/)).toBeDefined()

    await user.clear(screen.getByLabelText('Référence'))
    await user.type(screen.getByLabelText('Référence'), 'DAO-009/2026')
    await user.click(screen.getByRole('button', { name: 'Enregistrer les modifications' }))

    expect(api.updateProcedure).toHaveBeenCalledWith(
      expect.objectContaining({ procedureId: 'p1', reference: 'DAO-009/2026', method: 'DAO' })
    )
  })
})

describe('ProcedureDetailScreen', () => {
  const renderDetail = (): {
    onBack: ReturnType<typeof vi.fn>
    onEdit: ReturnType<typeof vi.fn>
  } => {
    const onBack = vi.fn()
    const onEdit = vi.fn()
    render(<ProcedureDetailScreen procedureId="p1" onEdit={onEdit} onBack={onBack} />)
    return { onBack, onEdit }
  }

  it('affiche l’en-tête, l’avancement et les cinq étapes, la prochaine étant signalée', async () => {
    installApiMock().getProcedure.mockResolvedValue(ok(progressed(2)))
    renderDetail()

    expect(await screen.findByRole('heading', { name: 'Procédure DAO-001/2026' })).toBeDefined()
    expect(screen.getByText('2 sur 5 — En cours')).toBeDefined()
    expect(screen.getAllByRole('row')).toHaveLength(1 + 5) // en-tête + 5 étapes
    expect(screen.getByText('Prochaine étape à valider')).toBeDefined()
    expect(screen.getAllByText(/Validée le 12\/03\/2026/)).toHaveLength(2)
  })

  it('ne propose de valider que l’étape qui suit la dernière validée', async () => {
    installApiMock().getProcedure.mockResolvedValue(ok(progressed(1)))
    renderDetail()
    await screen.findByRole('heading', { name: /Procédure/ })

    expect(
      screen
        .getByRole('button', { name: 'Valider l’étape Ouverture des plis' })
        .hasAttribute('disabled')
    ).toBe(false)
    expect(
      screen
        .getByRole('button', { name: 'Valider l’étape Évaluation des offres' })
        .hasAttribute('disabled')
    ).toBe(true)
  })

  it('ne permet de rouvrir que la dernière étape validée', async () => {
    installApiMock().getProcedure.mockResolvedValue(ok(progressed(2)))
    renderDetail()
    await screen.findByRole('heading', { name: /Procédure/ })

    expect(
      screen
        .getByRole('button', { name: 'Rouvrir l’étape Publication de l’avis' })
        .hasAttribute('disabled')
    ).toBe(true)
    expect(
      screen
        .getByRole('button', { name: 'Rouvrir l’étape Ouverture des plis' })
        .hasAttribute('disabled')
    ).toBe(false)
  })

  it('valide une étape et affiche la procédure mise à jour', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.getProcedure.mockResolvedValue(ok(progressed(1)))
    api.validateStep.mockResolvedValue(ok(progressed(2)))
    renderDetail()
    await screen.findByRole('heading', { name: /Procédure/ })

    await user.click(screen.getByRole('button', { name: 'Valider l’étape Ouverture des plis' }))

    expect(api.validateStep).toHaveBeenCalledWith({ procedureId: 'p1', step: 'OUVERTURE_PLIS' })
    expect(await screen.findByText('2 sur 5 — En cours')).toBeDefined()
  })

  it('affiche le motif quand la validation est refusée', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.getProcedure.mockResolvedValue(ok(detail()))
    api.validateStep.mockResolvedValue(
      fail(
        'ACTUAL_DATE_REQUIRED',
        'Renseignez la date réelle de l’étape « Publication de l’avis » avant de la valider.'
      )
    )
    renderDetail()
    await screen.findByRole('heading', { name: /Procédure/ })

    await user.click(screen.getByRole('button', { name: 'Valider l’étape Publication de l’avis' }))

    expect((await screen.findByRole('alert')).textContent).toContain('Renseignez la date réelle')
  })

  it('enregistre les dates d’une étape (vides envoyées en null)', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.getProcedure.mockResolvedValue(ok(detail()))
    api.saveStepDates.mockResolvedValue(ok(detail()))
    renderDetail()
    await screen.findByRole('heading', { name: /Procédure/ })

    await user.click(
      screen.getByRole('button', { name: 'Modifier les dates de Publication de l’avis' })
    )
    fireEvent.change(screen.getByLabelText('Date réelle de Publication de l’avis'), {
      target: { value: '2026-03-10' }
    })
    await user.click(screen.getByRole('button', { name: 'Enregistrer les dates' }))

    expect(api.saveStepDates).toHaveBeenCalledWith({
      procedureId: 'p1',
      step: 'PUBLICATION',
      plannedDate: null,
      actualDate: '2026-03-10'
    })
  })

  it('préremplit les dates existantes à la modification et permet d’annuler', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.getProcedure.mockResolvedValue(
      ok(
        detail({
          steps: KINDS.map((kind) =>
            step(kind, kind === 'PUBLICATION' ? { plannedDate: '2026-03-01' } : {})
          )
        })
      )
    )
    renderDetail()
    await screen.findByRole('heading', { name: /Procédure/ })

    await user.click(
      screen.getByRole('button', { name: 'Modifier les dates de Publication de l’avis' })
    )
    expect(
      screen.getByLabelText<HTMLInputElement>('Date prévue de Publication de l’avis').value
    ).toBe('2026-03-01')

    await user.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(screen.queryByLabelText('Date prévue de Publication de l’avis')).toBeNull()
    expect(api.saveStepDates).not.toHaveBeenCalled()
  })

  it('rouvre une étape validée', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.getProcedure.mockResolvedValue(ok(progressed(1)))
    api.reopenStep.mockResolvedValue(ok(progressed(0)))
    renderDetail()
    await screen.findByRole('heading', { name: /Procédure/ })

    await user.click(screen.getByRole('button', { name: 'Rouvrir l’étape Publication de l’avis' }))

    expect(api.reopenStep).toHaveBeenCalledWith({ procedureId: 'p1', step: 'PUBLICATION' })
    expect(await screen.findByText('0 sur 5 — Non démarrée')).toBeDefined()
  })

  it('demande une confirmation avant de supprimer la procédure', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.getProcedure.mockResolvedValue(ok(detail()))
    const { onBack } = renderDetail()
    await screen.findByRole('heading', { name: /Procédure/ })

    await user.click(screen.getByRole('button', { name: 'Supprimer cette procédure' }))
    expect(api.deleteProcedure).not.toHaveBeenCalled()
    await user.click(
      screen.getByRole('button', { name: 'Confirmer la suppression de la procédure' })
    )

    expect(api.deleteProcedure).toHaveBeenCalledWith({ procedureId: 'p1' })
    expect(onBack).toHaveBeenCalled()
  })

  it('transmet la procédure à modifier', async () => {
    const user = userEvent.setup()
    installApiMock().getProcedure.mockResolvedValue(ok(detail()))
    const { onEdit } = renderDetail()
    await screen.findByRole('heading', { name: /Procédure/ })

    await user.click(screen.getByRole('button', { name: 'Modifier l’en-tête' }))

    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }))
  })

  it('signale une procédure introuvable avec un retour possible', async () => {
    installApiMock().getProcedure.mockResolvedValue(
      fail('PROCEDURE_NOT_FOUND', 'Cette procédure n’existe pas.')
    )
    const { onBack } = renderDetail()
    expect((await screen.findByRole('alert')).textContent).toBe('Cette procédure n’existe pas.')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retour à la liste' }))
    expect(onBack).toHaveBeenCalled()
  })
})
