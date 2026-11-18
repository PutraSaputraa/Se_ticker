import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import AuthGate from './AuthGate.jsx';
import { LanguageSettings } from './components/LanguageSwitcher.jsx';
import './App.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <LanguageSettings />
      <AuthGate />
    </BrowserRouter>
  </StrictMode>,
);
