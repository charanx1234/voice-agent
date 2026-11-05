import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { DesktopPet } from './components/DesktopPet';
import './styles/globals.css';

const isPetWindow = window.location.hash === '#pet';

if (isPetWindow) {
  document.documentElement.classList.add('pet-mode');
  document.body.classList.add('pet-mode');
}

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      {isPetWindow ? <DesktopPet /> : <App />}
    </React.StrictMode>
  );
}

