import { useState } from 'react'
import type { ProcedureDetailDto } from '@shared/api'
import { ProcedureDetailScreen } from './ProcedureDetailScreen'
import { ProcedureForm } from './ProcedureForm'
import { ProcedureListScreen } from './ProcedureListScreen'

type View =
  | { readonly kind: 'list' }
  | { readonly kind: 'create' }
  | { readonly kind: 'detail'; readonly procedureId: string }
  | { readonly kind: 'edit'; readonly procedure: ProcedureDetailDto }

/** Module « Procédures » : liste, création, détail avec ses étapes, modification de l'en-tête. */
export function ProcedureModule(): React.JSX.Element {
  const [view, setView] = useState<View>({ kind: 'list' })

  if (view.kind === 'create') {
    return (
      <ProcedureForm
        procedure={null}
        onSaved={(procedureId) => {
          setView({ kind: 'detail', procedureId })
        }}
        onCancel={() => {
          setView({ kind: 'list' })
        }}
      />
    )
  }

  if (view.kind === 'edit') {
    const { procedure } = view
    return (
      <ProcedureForm
        procedure={procedure}
        onSaved={(procedureId) => {
          setView({ kind: 'detail', procedureId })
        }}
        onCancel={() => {
          setView({ kind: 'detail', procedureId: procedure.id })
        }}
      />
    )
  }

  if (view.kind === 'detail') {
    return (
      <ProcedureDetailScreen
        procedureId={view.procedureId}
        onEdit={(procedure) => {
          setView({ kind: 'edit', procedure })
        }}
        onBack={() => {
          setView({ kind: 'list' })
        }}
      />
    )
  }

  return (
    <ProcedureListScreen
      onOpen={(procedureId) => {
        setView({ kind: 'detail', procedureId })
      }}
      onCreate={() => {
        setView({ kind: 'create' })
      }}
    />
  )
}
