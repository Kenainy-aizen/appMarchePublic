// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DashboardDto, RegionsOverviewDto } from '@shared/api'
import { App } from '../../src/renderer/src/App'
import { DashboardPanels } from '../../src/renderer/src/screens/DashboardPanels'
import { fail, installApiMock, ok } from './helpers'

afterEach(cleanup)

const emptyStatuses = {
  NOT_STARTED: 0,
  IN_PROGRESS: 0,
  STOPPED: 0,
  PROVISIONALLY_RECEIVED: 0,
  FINALLY_RECEIVED: 0,
  CLOSED: 0
}

const emptyDashboard: DashboardDto = {
  plans: [],
  procedures: { total: 0, notStarted: 0, inProgress: 0, completed: 0, awarded: 0, byMethod: [] },
  contracts: {
    total: 0,
    byStatus: emptyStatuses,
    initialAmount: 0,
    amendmentsAmount: 0,
    currentAmount: 0
  },
  candidates: { total: 0, bids: 0, awardedBids: 0 }
}

const fullDashboard: DashboardDto = {
  plans: [
    {
      planId: 'ppm1',
      year: 2026,
      number: 1,
      lineCount: 3,
      launchedLineCount: 2,
      launchRatePercent: 67,
      plannedAmount: 4_000_000,
      contractedAmount: 950_000
    },
    {
      planId: 'ppm2',
      year: 2027,
      number: 2,
      lineCount: 0,
      launchedLineCount: 0,
      launchRatePercent: 0,
      plannedAmount: 0,
      contractedAmount: 0
    }
  ],
  procedures: {
    total: 5,
    notStarted: 2,
    inProgress: 2,
    completed: 1,
    awarded: 3,
    byMethod: [
      { method: 'DAO', count: 3, estimatedAmount: 2_500_000 },
      { method: 'DCP', count: 2, estimatedAmount: 400_000 }
    ]
  },
  contracts: {
    total: 3,
    byStatus: { ...emptyStatuses, NOT_STARTED: 1, IN_PROGRESS: 1, CLOSED: 1 },
    initialAmount: 2_000_000,
    amendmentsAmount: 150_000,
    currentAmount: 2_150_000
  },
  candidates: { total: 4, bids: 9, awardedBids: 3 }
}

const text = (element: HTMLElement): string => element.textContent.replace(/\s/g, ' ')

describe('DashboardPanels', () => {
  it('n’affiche aucun bloc pour une région sans donnée', () => {
    render(<DashboardPanels dashboard={emptyDashboard} onNavigate={vi.fn()} />)
    expect(screen.queryAllByRole('heading')).toEqual([])
  })

  it('montre la réalisation de chaque plan : lignes lancées, pourcentage, barre et montants', () => {
    render(<DashboardPanels dashboard={fullDashboard} onNavigate={vi.fn()} />)

    const rows = within(
      screen.getByRole('heading', { name: 'Réalisation du plan' }).closest('section') as HTMLElement
    ).getAllByRole('row')
    expect(text(rows[1] as HTMLElement)).toContain('Plan n° 1 (2026)')
    expect(text(rows[1] as HTMLElement)).toContain('2 sur 3 (67 %)')
    expect(text(rows[1] as HTMLElement)).toContain('4 000 000 Ar')
    expect(text(rows[1] as HTMLElement)).toContain('950 000 Ar')
    expect(screen.getByRole('img', { name: '67 % des lignes lancées' })).toBeDefined()
    // Un plan sans ligne : 0 %, jamais de division par zéro.
    expect(text(rows[2] as HTMLElement)).toContain('0 sur 0 (0 %)')
  })

  it('compte les procédures par situation et par mode de passation', () => {
    render(<DashboardPanels dashboard={fullDashboard} onNavigate={vi.fn()} />)
    const section = screen
      .getByRole('heading', { name: 'Procédures' })
      .closest('section') as HTMLElement

    const tiles: readonly (readonly [string, string])[] = [
      ['Procédures', '5'],
      ['Non démarrées', '2'],
      ['En cours', '2'],
      ['Terminées', '1'],
      ['Attribuées', '3']
    ]
    for (const [label, value] of tiles) {
      const tile = within(section)
        .getByText(label, { selector: '.stat__label' })
        .closest('.stat') as HTMLElement
      expect(within(tile).getByText(value)).toBeDefined()
    }
    const rows = within(section).getAllByRole('row')
    expect(text(rows[1] as HTMLElement)).toContain('Appel d’offres ouvert (DAO)')
    expect(text(rows[1] as HTMLElement)).toContain('2 500 000 Ar')
    expect(text(rows[2] as HTMLElement)).toContain('Consultation de prix (DCP)')
  })

  it('résume les contrats : montants, avenants signés et seulement les situations non vides', () => {
    render(<DashboardPanels dashboard={fullDashboard} onNavigate={vi.fn()} />)
    const section = screen
      .getByRole('heading', { name: 'Contrats' })
      .closest('section') as HTMLElement

    expect(text(section)).toContain('Montant initial2 000 000 Ar')
    expect(text(section)).toContain('Avenants+150 000 Ar')
    expect(text(section)).toContain('Montant actuel2 150 000 Ar')
    const rows = within(section)
      .getAllByRole('row')
      .slice(1)
      .map((row) => text(row))
    expect(rows).toEqual(['Non démarré1', 'En cours d’exécution1', 'Clôturé1'])
  })

  it.each([
    [-50_000, '−50 000 Ar'],
    [0, '0 Ar'],
    [120_000, '+120 000 Ar']
  ])('affiche une variation d’avenants de %i comme « %s »', (amendments, expected) => {
    const dashboard: DashboardDto = {
      ...emptyDashboard,
      contracts: { ...fullDashboard.contracts, amendmentsAmount: amendments }
    }
    render(<DashboardPanels dashboard={dashboard} onNavigate={vi.fn()} />)
    expect(
      text(screen.getByRole('heading', { name: 'Contrats' }).closest('section') as HTMLElement)
    ).toContain(`Avenants${expected.replace(/\s/g, ' ')}`)
  })

  it('résume candidats et offres', () => {
    render(<DashboardPanels dashboard={fullDashboard} onNavigate={vi.fn()} />)
    const section = screen
      .getByRole('heading', { name: 'Candidats et offres' })
      .closest('section') as HTMLElement
    expect(text(section)).toContain('4Candidats')
    expect(text(section)).toContain('9Offres reçues')
    expect(text(section)).toContain('3Offres retenues')
  })

  it('mène à chaque module depuis son bloc', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()
    render(<DashboardPanels dashboard={fullDashboard} onNavigate={onNavigate} />)

    await user.click(screen.getByRole('button', { name: 'Voir les procédures' }))
    await user.click(screen.getByRole('button', { name: 'Voir les contrats' }))
    await user.click(screen.getByRole('button', { name: 'Voir les candidats' }))

    expect(onNavigate.mock.calls.map((call: unknown[]) => call[0] as string)).toEqual([
      'procedures',
      'contracts',
      'candidates'
    ])
  })
})

describe('tableau de bord sur l’accueil', () => {
  const overview: RegionsOverviewDto = {
    organizationName: 'PRMP de Fianarantsoa',
    alertHorizonDays: 15,
    regions: [{ id: 'r1', name: 'Région 1' }],
    canCreate: true,
    suggestedName: 'Région 2'
  }

  const openHome = (): ReturnType<typeof installApiMock> => {
    const api = installApiMock()
    api.getRegionsOverview.mockResolvedValue(ok(overview))
    api.getSession.mockResolvedValue(ok({ region: { id: 'r1', name: 'Région 1' } }))
    return api
  }

  it('affiche les indicateurs sous la situation des plans', async () => {
    const api = openHome()
    api.getDashboard.mockResolvedValue(ok(fullDashboard))
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Réalisation du plan' })).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Procédures' })).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Contrats' })).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Candidats et offres' })).toBeDefined()
  })

  it('ne montre aucun bloc d’indicateurs pour une région vide', async () => {
    openHome()
    render(<App />)

    await screen.findByRole('navigation', { name: 'Navigation principale' })
    await vi.waitFor(() => {
      expect(screen.queryByRole('status')).toBeNull()
    })
    expect(screen.queryByRole('heading', { name: 'Procédures' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Contrats' })).toBeNull()
  })

  it('affiche l’erreur quand les indicateurs ne peuvent pas être calculés', async () => {
    const api = openHome()
    api.getDashboard.mockResolvedValue(fail('NO_ACTIVE_REGION', 'Aucune région n’est ouverte.'))
    render(<App />)

    expect((await screen.findByRole('alert')).textContent).toContain('Aucune région n’est ouverte.')
  })

  it('« Voir les contrats » ouvre la liste, pas le dernier contrat ouvert depuis une alerte', async () => {
    const user = userEvent.setup()
    const api = openHome()
    api.getDashboard.mockResolvedValue(ok(fullDashboard))
    api.listAlerts.mockResolvedValue(
      ok({
        today: '2026-06-15',
        horizonDays: 15,
        overdueCount: 1,
        upcomingCount: 0,
        items: [
          {
            key: 'k',
            kind: 'CONTRACT_NOT_STARTED',
            severity: 'OVERDUE',
            dueOn: '2026-06-01',
            daysLeft: -14,
            subject: 'M-001/2026',
            action: 'Émettre l’ordre de service de démarrage',
            target: { kind: 'CONTRACT', id: 'k1' }
          }
        ]
      })
    )
    api.getContract.mockResolvedValue(fail('CONTRACT_NOT_FOUND', 'Ce contrat n’existe pas.'))
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Voir les alertes' }))
    await user.click(await screen.findByRole('button', { name: /Ouvrir M-001\/2026/ }))
    expect(api.getContract).toHaveBeenCalledTimes(1)

    const nav = screen.getByRole('navigation', { name: 'Navigation principale' })
    await user.click(within(nav).getByRole('button', { name: 'Accueil' }))
    await user.click(await screen.findByRole('button', { name: 'Voir les contrats' }))

    await vi.waitFor(() => {
      expect(api.listContracts).toHaveBeenCalled()
    })
    expect(api.getContract).toHaveBeenCalledTimes(1) // la liste s'affiche : aucun contrat rouvert
  })
})
