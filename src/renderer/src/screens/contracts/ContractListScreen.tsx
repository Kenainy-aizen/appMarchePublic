import { useEffect, useState } from 'react'
import type { ContractSummaryDto } from '@shared/api'
import {
  CONTRACT_KIND_LABELS,
  CONTRACT_STATUS_LABELS,
  type ContractKindCode,
  type ContractStatusCode
} from '@shared/contract-options'
import { messageOf, unwrap } from '../../api-errors'
import { formatAriary } from '../../format'
import { Alert } from '../../ui/Alert'
import { EmptyState } from '../../ui/EmptyState'
import { Icon } from '../../ui/Icon'
import { PageHeader } from '../../ui/PageHeader'

interface Props {
  readonly onOpen: (contractId: string) => void
  readonly onCreate: () => void
}

export function ContractListScreen({ onOpen, onCreate }: Props): React.JSX.Element {
  const [contracts, setContracts] = useState<readonly ContractSummaryDto[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const alive = { current: true }
    void (async () => {
      try {
        const list = unwrap(await window.api.listContracts())
        if (alive.current) setContracts(list)
      } catch (failure) {
        if (alive.current) setError(messageOf(failure))
      }
    })()
    return () => {
      alive.current = false
    }
  }, [])

  const createButton = (
    <button type="button" onClick={onCreate}>
      <Icon name="plus" size={16} />
      Nouveau contrat
    </button>
  )

  return (
    <>
      <PageHeader
        title="Contrats"
        description="Marchés, conventions et achats directs, avec le suivi de leur exécution : ordres de service, réceptions, avenants et clôture."
        actions={contracts !== null && contracts.length > 0 ? createButton : undefined}
      />

      {error && <Alert tone="error">{error}</Alert>}
      {contracts === null && !error && <p role="status">Chargement…</p>}

      {contracts?.length === 0 && (
        <section className="panel panel--flush">
          <EmptyState
            icon="contract"
            title="Aucun contrat pour cette région."
            action={createButton}
          >
            Un marché se crée à partir d’une procédure dont l’attribution est validée. Une
            convention ou un achat direct se crée directement.
          </EmptyState>
        </section>
      )}

      {contracts !== null && contracts.length > 0 && (
        <section className="panel panel--flush">
          <div className="table-wrap">
            <table>
              <caption className="visually-hidden">Contrats de la région</caption>
              <thead>
                <tr>
                  <th scope="col">Référence</th>
                  <th scope="col">Type</th>
                  <th scope="col">Objet et titulaire</th>
                  <th scope="col" className="number">
                    Montant actuel
                  </th>
                  <th scope="col">Situation</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((contract) => (
                  <tr key={contract.id}>
                    <td>
                      <strong>{contract.reference}</strong>
                    </td>
                    <td>{CONTRACT_KIND_LABELS[contract.kind as ContractKindCode]}</td>
                    <td>
                      {contract.object}
                      <div className="cell-note">{contract.holderName}</div>
                    </td>
                    <td className="number">{formatAriary(contract.currentAmount)}</td>
                    <td>{CONTRACT_STATUS_LABELS[contract.status as ContractStatusCode]}</td>
                    <td className="number">
                      <button
                        type="button"
                        className="secondary small"
                        aria-label={`Ouvrir le contrat ${contract.reference}`}
                        onClick={() => {
                          onOpen(contract.id)
                        }}
                      >
                        Ouvrir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  )
}
