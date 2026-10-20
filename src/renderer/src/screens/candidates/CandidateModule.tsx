import { useState } from 'react'
import type { CandidateDto } from '@shared/api'
import { CandidateForm } from './CandidateForm'
import { CandidateListScreen } from './CandidateListScreen'

type View =
  { readonly kind: 'list' } | { readonly kind: 'form'; readonly candidate: CandidateDto | null }

/** Module « Candidats » : liste, création, modification. */
export function CandidateModule(): React.JSX.Element {
  const [view, setView] = useState<View>({ kind: 'list' })

  if (view.kind === 'form') {
    const backToList = (): void => {
      setView({ kind: 'list' })
    }
    return <CandidateForm candidate={view.candidate} onSaved={backToList} onCancel={backToList} />
  }

  return (
    <CandidateListScreen
      onCreate={() => {
        setView({ kind: 'form', candidate: null })
      }}
      onEdit={(candidate) => {
        setView({ kind: 'form', candidate })
      }}
    />
  )
}
