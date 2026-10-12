import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from './lib/AuthContext';
import { ThemeProvider } from './lib/ThemeContext';
import { SettingsProvider } from './lib/SettingsContext';
import { NotificationsProvider } from './lib/NotificationsContext';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <SettingsProvider>
        <NotificationsProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </NotificationsProvider>
      </SettingsProvider>
    </ThemeProvider>
  </StrictMode>,
);
