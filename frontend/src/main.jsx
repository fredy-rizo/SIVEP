import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { PlanProvider } from './context/PlanContext';
// Inter autohospedada: evita enviar la IP de los visitantes a Google Fonts.
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <PlanProvider>
          <App />
        </PlanProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);