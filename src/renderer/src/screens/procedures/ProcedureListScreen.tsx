import { useEffect, useState } from 'react'
import type { ProcedureSummaryDto } from '@shared/api'
import { METHOD_LABELS, type MethodCode } from '@shared/ppm-options'
import { messageOf, unwrap } from '../../api-errors'
import { formatAriary } from '../../format'
import { Alert } from '../../ui/Alert'
import { EmptyState } from '../../ui/EmptyState'
import { Icon } from '../../ui/Icon'
import { PageHeader } from '../../ui/PageHeader'
import { ProgressBadge } from '../../ui/ProgressBadge'

interface Props {
  readonly onOpen: (procedureId: string) => void
  readonly onCreate: () => void
}

export function ProcedureListScreen({ onOpen, onCreate }: Props): React.JSX.Element {
  const [procedures, setProcedures] = useState<readonly ProcedureSummaryDto[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const alive = { current: true }
    void (async () => {
      try {
        const list = unwrap(await window.api.listProcedures())
        if (alive.current) setProcedures(list)
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
      Nouvelle procédure
    </button>
  )

  return (
    <>
      <PageHeader
        title="Procédures de passation"
        description="Chaque procédure suit ses cinq étapes, de la publication de l’avis à l’approbation du marché."
        actions={procedures !== null && procedures.length > 0 ? createButton : undefined}
      />

      {error && <Alert tone="error">{error}</Alert>}
      {procedures === null && !error && <p role="status">Chargement…</p>}

      {procedures?.length === 0 && (
        <section className="panel panel--flush">
          <EmptyState
            icon="briefcase"
            title="Aucune procédure de passation pour cette région."
            action={createButton}
          >
            Créez une procédure, rattachée si possible à une ligne du plan de passation, puis suivez
            ses étapes.
          </EmptyState>
        </section>
      )}

      {procedures !== null && procedures.length > 0 && (
        <section className="panel panel--flush">
          <div className="table-wrap">
            <table>
              <caption className="visually-hidden">Procédures de passation de la région</caption>
              <thead>
                <tr>
                  <th scope="col">Référence</th>
                  <th scope="col">Objet</th>
                  <th scope="col">Mode</th>
                  <th scope="col">Avancement</th>
                  <th scope="col" className="number">
                    Montant estimé
                  </th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {procedures.map((procedure) => (
                  <tr key={procedure.id}>
                    <td>
                      <strong>{procedure.reference}</strong>
                    </td>
                    <td>{procedure.object}</td>
                    <td>{METHOD_LABELS[procedure.method as MethodCode]}</td>
                    <td>
                      <ProgressBadge
                        status={procedure.status}
                        validatedCount={procedure.validatedCount}
                        totalSteps={procedure.totalSteps}
                      />
                    </td>
                    <td className="number">
                      {procedure.estimatedAmount === null
                        ? '—'
                        : formatAriary(procedure.estimatedAmount)}
                    </td>
                    <td className="number">
                      <button
                        type="button"
                        className="secondary small"
                        aria-label={`Ouvrir la procédure ${procedure.reference}`}
                        onClick={() => {
                          onOpen(procedure.id)
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
