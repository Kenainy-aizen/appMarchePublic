import { useState } from 'react'
import type { PpmLineDto } from '@shared/api'
import { PpmDetailScreen } from './PpmDetailScreen'
import { PpmLineForm } from './PpmLineForm'
import { PpmListScreen } from './PpmListScreen'

type View =
  | { readonly kind: 'list' }
  | { readonly kind: 'detail'; readonly ppmId: string }
  | { readonly kind: 'line'; readonly ppmId: string; readonly line: PpmLineDto | null }

/** Module « Plan de passation » : liste des plans, détail d'un plan, formulaire d'une ligne. */
export function PpmModule(): React.JSX.Element {
  const [view, setView] = useState<View>({ kind: 'list' })

  if (view.kind === 'detail') {
    const { ppmId } = view
    return (
      <PpmDetailScreen
        ppmId={ppmId}
        onEditLine={(line) => {
          setView({ kind: 'line', ppmId, line })
        }}
        onBack={() => {
          setView({ kind: 'list' })
        }}
      />
    )
  }

  if (view.kind === 'line') {
    const { ppmId } = view
    const backToDetail = (): void => {
      setView({ kind: 'detail', ppmId })
    }
    return (
      <PpmLineForm ppmId={ppmId} line={view.line} onSaved={backToDetail} onCancel={backToDetail} />
    )
  }

  return (
    <PpmListScreen
      onOpen={(ppmId) => {
        setView({ kind: 'detail', ppmId })
      }}
    />
  )
}
