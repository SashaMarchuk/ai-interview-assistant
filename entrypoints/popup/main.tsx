import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '../../src/assets/app.css';
import { storeReadyPromise } from '../../src/store';

// Show loading state while store hydrates
const rootElement = document.getElementById('root')!;
rootElement.innerHTML = '<div style="padding: 16px; color: #666;">Loading...</div>';

// Wait for store to hydrate from chrome.storage before rendering
storeReadyPromise.then(() => {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
