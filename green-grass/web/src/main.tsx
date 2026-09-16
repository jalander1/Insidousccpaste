import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';
import { Boundary } from './load.js';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Boundary>
      <App />
    </Boundary>
  </React.StrictMode>,
);
