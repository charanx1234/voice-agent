import React, { Component, ErrorInfo, ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { DesktopPet } from './components/DesktopPet';
import './styles/globals.css';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[FRIDAY ErrorBoundary caught error]:', error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: '24px',
            color: '#f8fafc',
            backgroundColor: '#0f172a',
            height: '100vh',
            boxSizing: 'border-box',
            fontFamily: 'system-ui, sans-serif',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            textAlign: 'center',
          }}
        >
          <h2 style={{ color: '#ef4444', marginBottom: '8px', fontSize: '1.25rem' }}>
            FRIDAY Recovery Screen
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginBottom: '16px', maxWidth: '360px' }}>
            {this.state.error?.message || 'An unexpected rendering error occurred.'}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 16px',
              backgroundColor: '#3b82f6',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Reload Interface
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const isPetWindow = window.location.hash === '#pet';

if (isPetWindow) {
  document.documentElement.classList.add('pet-mode');
  document.body.classList.add('pet-mode');
}

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        {isPetWindow ? <DesktopPet /> : <App />}
      </ErrorBoundary>
    </React.StrictMode>
  );
}
