import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import '@fontsource-variable/public-sans/wght.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'
import './styles/layout.css'

const container = document.getElementById('root')
if (!container) throw new Error('Élément racine #root introuvable')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)
