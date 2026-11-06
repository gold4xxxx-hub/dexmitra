import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import WelcomePage from './WelcomePage.tsx'

export function Root() {
  const [showWelcome, setShowWelcome] = useState(true)

  return showWelcome ? (
    <WelcomePage
      onFinish={() => setShowWelcome(false)}
    />
  ) : (
    <App />
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
