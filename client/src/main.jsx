import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ArtistProvider } from './context/ArtistContext'
import { PlaylistProvider } from './context/PlaylistContext'
import { ToastProvider } from './context/ToastContext'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ArtistProvider>
        <ToastProvider>
          <PlaylistProvider>
            <App />
          </PlaylistProvider>
        </ToastProvider>
      </ArtistProvider>
    </BrowserRouter>
  </StrictMode>,
)
