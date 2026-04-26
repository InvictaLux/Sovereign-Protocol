import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// We removed seedMarketplace() from here because it needs 
// an authenticated user context to write to Firestore.
// The App component will trigger it after signInAnonymously.

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)