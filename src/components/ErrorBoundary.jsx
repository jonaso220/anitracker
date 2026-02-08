import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', padding: '2rem',
          background: 'linear-gradient(135deg, #0f0f1a, #1a1a2e)', color: '#fff',
          fontFamily: "'Outfit', sans-serif", textAlign: 'center'
        }}>
          <span style={{ fontSize: '4rem', marginBottom: '1rem' }}>😵</span>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', background: 'linear-gradient(135deg, #a855f7, #4ecdc4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Algo salió mal
          </h1>
          <p style={{ opacity: 0.6, marginBottom: '1.5rem', maxWidth: '400px' }}>
            Ocurrió un error inesperado. Tus datos están guardados en el navegador.
          </p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
            style={{
              padding: '0.75rem 2rem', border: 'none', borderRadius: '12px',
              background: 'linear-gradient(135deg, #a855f7, #4ecdc4)',
              color: '#fff', fontSize: '1rem', fontWeight: 600, cursor: 'pointer'
            }}
          >
            Recargar app
          </button>
          {this.state.error && (
            <details style={{ marginTop: '2rem', opacity: 0.4, fontSize: '0.75rem', maxWidth: '90vw', textAlign: 'left' }}>
              <summary>Detalles del error</summary>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginTop: '0.5rem' }}>
                {this.state.error.toString()}
              </pre>
            </details>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
