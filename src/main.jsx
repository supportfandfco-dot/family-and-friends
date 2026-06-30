import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Build stamp — lets us instantly tell if a user is seeing a stale
// cached deploy vs the latest build, just by checking DevTools console.
if (import.meta.env.PROD) {
  console.info(`%c[Family & Friends] Build ${new Date().toISOString()}`, 'color:#22c55e;font-weight:bold');
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
