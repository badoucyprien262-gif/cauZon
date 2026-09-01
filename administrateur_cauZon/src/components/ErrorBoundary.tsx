import React, { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {}
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: '16px', padding: '32px', fontFamily: 'Inter, sans-serif', backgroundColor: '#1a0a0f', color: '#FAF6EB' }}>
          <span style={{ fontSize: '48px' }}>⚠️</span>
          <h2 style={{ color: '#E74C3C', fontSize: '22px', fontWeight: 700 }}>Une erreur critique est survenue</h2>
          <pre style={{ background: '#111', padding: '16px', borderRadius: '8px', fontSize: '13px', maxWidth: '600px', overflowX: 'auto', color: '#F87171', border: '1px solid #7F011F' }}>
            {this.state.error?.toString()}
          </pre>
          <button onClick={() => window.location.reload()} style={{ backgroundColor: '#6B1124', color: '#FFFFFF', border: 'none', padding: '12px 24px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '15px' }}>
            Rafraîchir l'application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
