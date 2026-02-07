import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Masquer le splash de chargement une fois React monté
const splash = document.getElementById('loading-splash');
if (splash) {
  splash.classList.add('fade-out');
  setTimeout(() => splash.remove(), 300);
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
