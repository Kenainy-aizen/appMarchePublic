// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  CandidateDto,
  ContractableProcedureDto,
  ContractDetailDto,
  ContractSummaryDto
} from '@shared/api'
import { ContractDetailScreen } from '../../src/renderer/src/screens/contracts/ContractDetailScreen'
import { ContractForm } from '../../src/renderer/src/screens/contracts/ContractForm'
import { ContractListScreen } from '../../src/renderer/src/screens/contracts/ContractListScreen'
import { fail, installApiMock, ok } from './helpers'

afterEach(cleanup)

const summary = (overrides: Partial<ContractSummaryDto> = {}): ContractSummaryDto => ({
  id: 'k1',
  reference: 'M-001/2026',
  kind: 'MARCHE',
  object: 'Fourniture de mobilier',
  holderName: 'SARL Alpha',
  amount: 900_000,
  currentAmount: 1_050_000,
  signedOn: '2026-03-01',
  status: 'IN_PROGRESS',
  ...overrides
})

const detail = (overrides: Partial<ContractDetailDto> = {}): ContractDetailDto => ({
  ...summary(),
  holderId: 'c1',
  procedure: { id: 'p1', reference: 'DAO-001/2026' },
  ppmLine: null,
  events: [],
  allowedEvents: ['ORDRE_SERVICE_DEMARRAGE', 'AVENANT'],
  headerLocked: false,
  status: 'NOT_STARTED',
  currentAmount: 900_000,
  ...overrides
})

const candidate = (overrides: Partial<CandidateDto> = {}): CandidateDto => ({
  id: 'c1',
  name: 'SARL Alpha',
  nif: '1',
  stat: null,
  address: null,
  phone: null,
  email: null,
  bidCount: 0,
  ...overrides
})

const contractable = (
  overrides: Partial<ContractableProcedureDto> = {}
): ContractableProcedureDto => ({
  id: 'p1',
  reference: 'DAO-001/2026',
  object: 'Fourniture de mobilier',
  holderId: 'c1',
  holderName: 'SARL Alpha',
  amount: 900_000,
  ppmLineId: null,
  ...overrides
})

const text = (element: HTMLElement): string => element.textContent.replace(/\s/g, ' ')

describe('ContractListScreen', () => {
  it('explique comment créer un premier contrat quand la liste est vide', async () => {
    const user = userEvent.setup()
    installApiMock().listContracts.mockResolvedValue(ok([]))
    const onCreate = vi.fn()
    render(<ContractListScreen onOpen={vi.fn()} onCreate={onCreate} />)

    expect(await screen.findByText('Aucun contrat pour cette région.')).toBeDefined()
    await user.click(screen.getByRole('button', { name: 'Nouveau contrat' }))
    expect(onCreate).toHaveBeenCalled()
  })

  it('liste les contrats avec type, titulaire, montant actuel et situation, et ouvre celui choisi', async () => {
    const user = userEvent.setup()
    installApiMock().listContracts.mockResolvedValue(
      ok([
        summary(),
        summary({ id: 'k2', reference: 'A-002/2026', kind: 'ACHAT_DIRECT', status: 'CLOSED' })
      ])
    )
    const onOpen = vi.fn()
    render(<ContractListScreen onOpen={onOpen} onCreate={vi.fn()} />)

    const rows = await screen.findAllByRole('row')
    expect(text(rows[1] as HTMLElement)).toContain('Marché')
    expect(text(rows[1] as HTMLElement)).toContain('SARL Alpha')
    expect(text(rows[1] as HTMLElement)).toContain('1 050 000 Ar')
    expect(text(rows[1] as HTMLElement)).toContain('En cours d’exécution')
    expect(text(rows[2] as HTMLElement)).toContain('Achat direct')
    expect(text(rows[2] as HTMLElement)).toContain('Clôturé')

    await user.click(screen.getByRole('button', { name: 'Ouvrir le contrat A-002/2026' }))
    expect(onOpen).toHaveBeenCalledWith('k2')
  })
})

describe('ContractForm', () => {
  const setup = (
    options: {
      contract?: ContractDetailDto | null
      initialProcedureId?: string | null
      procedures?: readonly ContractableProcedureDto[]
    } = {}
  ): { api: ReturnType<typeof installApiMock>; onSaved: ReturnType<typeof vi.fn> } => {
    const api = installApiMock()
    api.listContractableProcedures.mockResolvedValue(ok(options.procedures ?? [contractable()]))
    api.listCandidates.mockResolvedValue(
      ok([candidate(), candidate({ id: 'c2', name: 'Beta', nif: '2' })])
    )
    api.listPpmLines.mockResolvedValue(ok([]))
    const onSaved = vi.fn()
    render(
      <ContractForm
        contract={options.contract ?? null}
        initialProcedureId={options.initialProcedureId ?? null}
        onSaved={onSaved}
        onCancel={vi.fn()}
      />
    )
    return { api, onSaved }
  }

  it('crée un marché : la procédure choisie préremplit objet et montant, et fixe le titulaire', async () => {
    const user = userEvent.setup()
    const { api, onSaved } = setup()
    api.createContract.mockResolvedValue(ok(detail()))
    await screen.findByRole('option', { name: /DAO-001\/2026/ })

    await user.selectOptions(
      screen.getByLabelText('Procédure attribuée'),
      'DAO-001/2026 : Fourniture de mobilier'
    )

    expect(screen.getByLabelText<HTMLTextAreaElement>('Objet').value).toBe('Fourniture de mobilier')
    expect(
      screen.getByLabelText<HTMLInputElement>('Montant initial (Ar)').value.replace(/\s/g, '')
    ).toBe('900000')
    expect(screen.getByText('SARL Alpha', { selector: 'strong' })).toBeDefined()

    await user.type(screen.getByLabelText('Référence'), 'M-001/2026')
    fireEvent.change(screen.getByLabelText('Date de signature'), {
      target: { value: '2026-03-01' }
    })
    await user.click(screen.getByRole('button', { name: 'Créer le contrat' }))

    expect(api.createContract).toHaveBeenCalledWith({
      kind: 'MARCHE',
      procedureId: 'p1',
      reference: 'M-001/2026',
      object: 'Fourniture de mobilier',
      holderId: 'c1',
      ppmLineId: null,
      amount: 900_000,
      signedOn: '2026-03-01'
    })
    expect(onSaved).toHaveBeenCalledWith('k1')
  })

  it('présélectionne la procédure venue de sa page', async () => {
    setup({ initialProcedureId: 'p1' })
    await screen.findByRole('option', { name: /DAO-001\/2026/ })
    await vi.waitFor(() => {
      expect(screen.getByLabelText<HTMLSelectElement>('Procédure attribuée').value).toBe('p1')
    })
    expect(screen.getByLabelText<HTMLTextAreaElement>('Objet').value).toBe('Fourniture de mobilier')
  })

  it('explique quand aucune procédure attribuée n’est disponible', async () => {
    setup({ procedures: [] })
    expect(await screen.findByText(/Aucune procédure attribuée sans marché/)).toBeDefined()
  })

  it('crée un achat direct avec un titulaire choisi, sans procédure', async () => {
    const user = userEvent.setup()
    const { api } = setup()
    api.createContract.mockResolvedValue(ok(detail({ kind: 'ACHAT_DIRECT' })))
    await screen.findByRole('option', { name: /DAO-001\/2026/ })

    await user.selectOptions(screen.getByLabelText('Type de contrat'), 'Achat direct')
    await user.selectOptions(await screen.findByLabelText('Titulaire'), 'Beta')
    await user.type(screen.getByLabelText('Référence'), 'A-001/2026')
    await user.type(screen.getByLabelText('Objet'), 'Achat de fournitures')
    await user.type(screen.getByLabelText('Montant initial (Ar)'), '250 000')
    await user.click(screen.getByRole('button', { name: 'Créer le contrat' }))

    expect(api.createContract).toHaveBeenCalledWith({
      kind: 'ACHAT_DIRECT',
      procedureId: null,
      reference: 'A-001/2026',
      object: 'Achat de fournitures',
      holderId: 'c2',
      ppmLineId: null,
      amount: 250_000,
      signedOn: null
    })
  })

  it('refuse un montant illisible sans appeler le processus principal', async () => {
    const user = userEvent.setup()
    const { api } = setup()
    await screen.findByRole('option', { name: /DAO-001\/2026/ })
    await user.selectOptions(screen.getByLabelText('Type de contrat'), 'Convention')
    await user.selectOptions(await screen.findByLabelText('Titulaire'), 'Beta')
    await user.type(screen.getByLabelText('Référence'), 'C-1')
    await user.type(screen.getByLabelText('Objet'), 'Objet')
    await user.type(screen.getByLabelText('Montant initial (Ar)'), 'beaucoup')

    await user.click(screen.getByRole('button', { name: 'Créer le contrat' }))

    expect((await screen.findByRole('alert')).textContent).toContain('montant est invalide')
    expect(api.createContract).not.toHaveBeenCalled()
  })

  it('affiche l’erreur métier et reste sur le formulaire', async () => {
    const user = userEvent.setup()
    const { api, onSaved } = setup()
    api.createContract.mockResolvedValue(
      fail('DUPLICATE_CONTRACT_REFERENCE', 'Un contrat porte déjà la référence « C-1 ».')
    )
    await screen.findByRole('option', { name: /DAO-001\/2026/ })
    await user.selectOptions(screen.getByLabelText('Type de contrat'), 'Convention')
    await user.selectOptions(await screen.findByLabelText('Titulaire'), 'Beta')
    await user.type(screen.getByLabelText('Référence'), 'C-1')
    await user.type(screen.getByLabelText('Objet'), 'Objet')
    await user.type(screen.getByLabelText('Montant initial (Ar)'), '100')

    await user.click(screen.getByRole('button', { name: 'Créer le contrat' }))

    expect((await screen.findByRole('alert')).textContent).toContain('porte déjà la référence')
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('en modification : type fixe, titulaire d’un marché non modifiable, montant et signature libres sans événement', async () => {
    const user = userEvent.setup()
    const { api } = setup({ contract: detail() })
    api.updateContract.mockResolvedValue(ok(detail()))

    expect(screen.getByLabelText<HTMLSelectElement>('Type de contrat').disabled).toBe(true)
    expect(screen.getByText(/non modifiable pour un marché/)).toBeDefined()
    expect(screen.getByLabelText<HTMLInputElement>('Montant initial (Ar)').disabled).toBe(false)

    await user.clear(screen.getByLabelText('Référence'))
    await user.type(screen.getByLabelText('Référence'), 'M-009/2026')
    await user.click(screen.getByRole('button', { name: 'Enregistrer les modifications' }))

    expect(api.updateContract).toHaveBeenCalledWith(
      expect.objectContaining({
        contractId: 'k1',
        reference: 'M-009/2026',
        holderId: 'c1',
        amount: 900_000
      })
    )
  })

  it('en modification : montant et signature verrouillés dès le premier événement', () => {
    setup({ contract: detail({ headerLocked: true }) })
    expect(screen.getByLabelText<HTMLInputElement>('Montant initial (Ar)').disabled).toBe(true)
    expect(screen.getByLabelText<HTMLInputElement>('Date de signature').disabled).toBe(true)
    expect(screen.getByText(/ne peuvent plus être modifiés/)).toBeDefined()
  })
})

describe('ContractDetailScreen', () => {
  const renderDetail = (): {
    onBack: ReturnType<typeof vi.fn>
    onEdit: ReturnType<typeof vi.fn>
  } => {
    const onBack = vi.fn()
    const onEdit = vi.fn()
    render(<ContractDetailScreen contractId="k1" onEdit={onEdit} onBack={onBack} />)
    return { onBack, onEdit }
  }

  it('affiche l’en-tête, les montants initial et actuel, la situation et l’origine', async () => {
    installApiMock().getContract.mockResolvedValue(
      ok(detail({ currentAmount: 1_050_000, status: 'IN_PROGRESS' }))
    )
    renderDetail()

    expect(await screen.findByRole('heading', { name: 'Contrat M-001/2026' })).toBeDefined()
    expect(text(document.body)).toContain('Montant initial900 000 Ar')
    expect(text(document.body)).toContain('Montant actuel1 050 000 Ar')
    expect(text(document.body)).toContain('En cours d’exécution')
    expect(text(document.body)).toContain('Procédure DAO-001/2026')
  })

  it('n’offre que les événements autorisés à l’étape actuelle', async () => {
    installApiMock().getContract.mockResolvedValue(
      ok(detail({ allowedEvents: ['RECEPTION_DEFINITIVE'] }))
    )
    renderDetail()
    await screen.findByRole('heading', { name: /Contrat/ })

    const options = screen.getAllByRole('option').map((option) => option.textContent)
    expect(options).toEqual(['Réception définitive'])
  })

  it('enregistre un événement avec sa date et sa note', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.getContract.mockResolvedValue(ok(detail()))
    api.addContractEvent.mockResolvedValue(
      ok(
        detail({
          status: 'IN_PROGRESS',
          events: [
            {
              id: 'e1',
              kind: 'ORDRE_SERVICE_DEMARRAGE',
              occurredOn: '2026-03-10',
              amountDelta: null,
              note: 'Chantier lancé'
            }
          ],
          allowedEvents: ['ORDRE_SERVICE_ARRET', 'RECEPTION_PROVISOIRE', 'AVENANT'],
          headerLocked: true
        })
      )
    )
    renderDetail()
    await screen.findByRole('heading', { name: /Contrat/ })

    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-03-10' } })
    await user.type(screen.getByLabelText('Note (facultative)'), 'Chantier lancé')
    await user.click(screen.getByRole('button', { name: 'Enregistrer l’événement' }))

    expect(api.addContractEvent).toHaveBeenCalledWith({
      contractId: 'k1',
      kind: 'ORDRE_SERVICE_DEMARRAGE',
      occurredOn: '2026-03-10',
      amountDelta: null,
      note: 'Chantier lancé'
    })
    expect(await screen.findByText('Chantier lancé', { selector: 'td' })).toBeDefined()
  })

  it('un avenant demande une variation de montant, négative acceptée', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.getContract.mockResolvedValue(ok(detail()))
    api.addContractEvent.mockResolvedValue(ok(detail()))
    renderDetail()
    await screen.findByRole('heading', { name: /Contrat/ })

    expect(screen.queryByLabelText('Variation du montant (Ar)')).toBeNull()
    await user.selectOptions(screen.getByLabelText('Événement'), 'Avenant')
    await user.type(screen.getByLabelText('Variation du montant (Ar)'), '-50 000')
    await user.click(screen.getByRole('button', { name: 'Enregistrer l’événement' }))

    expect(api.addContractEvent).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'AVENANT', amountDelta: -50_000 })
    )
  })

  it('refuse une variation illisible sans appeler le processus principal', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.getContract.mockResolvedValue(ok(detail()))
    renderDetail()
    await screen.findByRole('heading', { name: /Contrat/ })
    await user.selectOptions(screen.getByLabelText('Événement'), 'Avenant')
    await user.type(screen.getByLabelText('Variation du montant (Ar)'), 'beaucoup')

    await user.click(screen.getByRole('button', { name: 'Enregistrer l’événement' }))

    expect((await screen.findByRole('alert')).textContent).toContain(
      'variation de montant est invalide'
    )
    expect(api.addContractEvent).not.toHaveBeenCalled()
  })

  it('affiche le motif d’un refus de l’exécution', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.getContract.mockResolvedValue(ok(detail()))
    api.addContractEvent.mockResolvedValue(
      fail(
        'EVENT_DATE_BEFORE_SIGNATURE',
        'La date de l’événement ne peut pas précéder la date de signature du contrat.'
      )
    )
    renderDetail()
    await screen.findByRole('heading', { name: /Contrat/ })

    await user.click(screen.getByRole('button', { name: 'Enregistrer l’événement' }))

    expect((await screen.findByRole('alert')).textContent).toContain(
      'précéder la date de signature'
    )
  })

  it('invite à renseigner la date de signature et masque la saisie d’événement', async () => {
    installApiMock().getContract.mockResolvedValue(
      ok(detail({ signedOn: null, allowedEvents: [] }))
    )
    renderDetail()
    await screen.findByRole('heading', { name: /Contrat/ })

    expect(screen.getByText(/Renseignez la date de signature/)).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Enregistrer l’événement' })).toBeNull()
  })

  it('un contrat clôturé n’accepte plus d’événement', async () => {
    installApiMock().getContract.mockResolvedValue(
      ok(
        detail({
          status: 'CLOSED',
          allowedEvents: [],
          headerLocked: true,
          events: [
            { id: 'e1', kind: 'CLOTURE', occurredOn: '2026-12-15', amountDelta: null, note: null }
          ]
        })
      )
    )
    renderDetail()
    await screen.findByRole('heading', { name: /Contrat/ })

    expect(screen.getByText(/Le contrat est clôturé/)).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Enregistrer l’événement' })).toBeNull()
  })

  it('annule le dernier événement après confirmation', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    const withEvent = detail({
      status: 'IN_PROGRESS',
      headerLocked: true,
      events: [
        {
          id: 'e1',
          kind: 'ORDRE_SERVICE_DEMARRAGE',
          occurredOn: '2026-03-10',
          amountDelta: null,
          note: null
        }
      ]
    })
    api.getContract.mockResolvedValue(ok(withEvent))
    api.removeLastContractEvent.mockResolvedValue(ok(detail()))
    renderDetail()
    await screen.findByRole('heading', { name: /Contrat/ })

    await user.click(screen.getByRole('button', { name: 'Annuler le dernier événement' }))
    expect(api.removeLastContractEvent).not.toHaveBeenCalled()
    await user.click(
      screen.getByRole('button', {
        name: /Confirmer l’annulation de « Ordre de service de démarrage »/
      })
    )

    expect(api.removeLastContractEvent).toHaveBeenCalledWith({ contractId: 'k1' })
    expect(await screen.findByText('Aucun événement enregistré.')).toBeDefined()
  })

  it('demande une confirmation avant de supprimer le contrat', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.getContract.mockResolvedValue(ok(detail()))
    const { onBack } = renderDetail()
    await screen.findByRole('heading', { name: /Contrat/ })

    await user.click(screen.getByRole('button', { name: 'Supprimer ce contrat' }))
    expect(api.deleteContract).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Confirmer la suppression du contrat' }))

    expect(api.deleteContract).toHaveBeenCalledWith({ contractId: 'k1' })
    expect(onBack).toHaveBeenCalled()
  })

  it('affiche le motif quand la suppression est refusée (événements enregistrés)', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.getContract.mockResolvedValue(ok(detail()))
    api.deleteContract.mockResolvedValue(
      fail(
        'CONTRACT_HAS_EVENTS',
        'Ce contrat a des événements d’exécution : annulez-les d’abord, du plus récent au plus ancien.'
      )
    )
    const { onBack } = renderDetail()
    await screen.findByRole('heading', { name: /Contrat/ })

    await user.click(screen.getByRole('button', { name: 'Supprimer ce contrat' }))
    await user.click(screen.getByRole('button', { name: 'Confirmer la suppression du contrat' }))

    expect((await screen.findByRole('alert')).textContent).toContain('annulez-les d’abord')
    expect(onBack).not.toHaveBeenCalled()
  })

  it('transmet le contrat à modifier, et signale un contrat introuvable', async () => {
    const user = userEvent.setup()
    installApiMock().getContract.mockResolvedValue(ok(detail()))
    const { onEdit } = renderDetail()
    await screen.findByRole('heading', { name: /Contrat/ })
    await user.click(screen.getByRole('button', { name: 'Modifier l’en-tête' }))
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'k1' }))
  })

  it('signale un contrat introuvable avec un retour possible', async () => {
    installApiMock().getContract.mockResolvedValue(
      fail('CONTRACT_NOT_FOUND', 'Ce contrat n’existe pas.')
    )
    const { onBack } = renderDetail()
    expect((await screen.findByRole('alert')).textContent).toBe('Ce contrat n’existe pas.')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retour à la liste' }))
    expect(onBack).toHaveBeenCalled()
  })
})
