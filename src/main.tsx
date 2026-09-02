import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { registerServiceWorker } from './ui/pwa';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found');
}

createRoot(rootElement).render(
  <StrictMode>
    {/*
      Outside `App`, and outside nothing else: a boundary inside the game could
      only catch the part of the screen it wraps, and every state the game has
      lives in the one component this is wrapping.
    */}
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

registerServiceWorker();
