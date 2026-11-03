import { useState } from 'react'
import type { ContractDetailDto } from '@shared/api'
import { ContractDetailScreen } from './ContractDetailScreen'
import { ContractForm } from './ContractForm'
import { ContractListScreen } from './ContractListScreen'

/** Demande de navigation venue d'un autre module (page d'une procédure). */
export type ContractIntent =
  | { readonly kind: 'create'; readonly procedureId: string }
  | { readonly kind: 'open'; readonly contractId: string }

type View =
  | { readonly kind: 'list' }
  | { readonly kind: 'create'; readonly procedureId: string | null }
  | { readonly kind: 'detail'; readonly contractId: string }
  | { readonly kind: 'edit'; readonly contract: ContractDetailDto }

function initialView(intent: ContractIntent | null): View {
  if (intent?.kind === 'create') return { kind: 'create', procedureId: intent.procedureId }
  if (intent?.kind === 'open') return { kind: 'detail', contractId: intent.contractId }
  return { kind: 'list' }
}

interface Props {
  readonly intent: ContractIntent | null
}

/** Module « Contrats » : liste, création, détail avec exécution, modification de l'en-tête. */
export function ContractModule({ intent }: Props): React.JSX.Element {
  const [view, setView] = useState<View>(() => initialView(intent))

  if (view.kind === 'create') {
    return (
      <ContractForm
        contract={null}
        initialProcedureId={view.procedureId}
        onSaved={(contractId) => {
          setView({ kind: 'detail', contractId })
        }}
        onCancel={() => {
          setView({ kind: 'list' })
        }}
      />
    )
  }

  if (view.kind === 'edit') {
    const { contract } = view
    return (
      <ContractForm
        contract={contract}
        initialProcedureId={null}
        onSaved={(contractId) => {
          setView({ kind: 'detail', contractId })
        }}
        onCancel={() => {
          setView({ kind: 'detail', contractId: contract.id })
        }}
      />
    )
  }

  if (view.kind === 'detail') {
    return (
      <ContractDetailScreen
        contractId={view.contractId}
        onEdit={(contract) => {
          setView({ kind: 'edit', contract })
        }}
        onBack={() => {
          setView({ kind: 'list' })
        }}
      />
    )
  }

  return (
    <ContractListScreen
      onOpen={(contractId) => {
        setView({ kind: 'detail', contractId })
      }}
      onCreate={() => {
        setView({ kind: 'create', procedureId: null })
      }}
    />
  )
}
