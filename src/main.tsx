import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary } from './ErrorBoundary';
import { FirebaseAuthProvider } from './lib/FirebaseAuthProvider';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <FirebaseAuthProvider>
        <App />
      </FirebaseAuthProvider>
    </ErrorBoundary>
  </StrictMode>,
);
