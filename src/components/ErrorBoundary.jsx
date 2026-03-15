/**
 * Error Boundary - Captura errores de renderizado de React
 * =========================================================
 * 
 * Componente de clase que captura errores en componentes hijos
 * y muestra una UI de fallback en lugar de pantalla en negro
 */

import React from 'react'
import i18n from '../i18n'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    // Actualizar el estado para que el siguiente render muestre la UI de fallback
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    // Registrar el error en la consola
    console.error('❌ [ErrorBoundary] Error capturado:', error)
    console.error('📍 Componente afectado:', errorInfo.componentStack)
    
    this.setState({
      error,
      errorInfo
    })
  }

  render() {
    if (this.state.hasError) {
      // UI de fallback cuando hay un error
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '2rem',
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
          color: '#fff',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          <div style={{
            maxWidth: '600px',
            background: 'rgba(255, 255, 255, 0.05)',
            padding: '2rem',
            borderRadius: '12px',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
            <h1 style={{ color: '#ff4757', marginBottom: '1rem' }}>
              {i18n.t('error.title')}
            </h1>
            <p style={{ marginBottom: '1rem', opacity: 0.9 }}>
              {i18n.t('error.message')}
            </p>
            <details style={{ marginTop: '1rem' }}>
              <summary style={{ cursor: 'pointer', marginBottom: '0.5rem' }}>
                {i18n.t('error.details')}
              </summary>
              <pre style={{
                background: 'rgba(0, 0, 0, 0.3)',
                padding: '1rem',
                borderRadius: '8px',
                overflow: 'auto',
                fontSize: '0.875rem',
                marginTop: '0.5rem'
              }}>
                {this.state.error && this.state.error.toString()}
                <br />
                <br />
                {this.state.errorInfo && this.state.errorInfo.componentStack}
              </pre>
            </details>
            <button
              onClick={() => window.location.reload()}
              style={{
                marginTop: '1.5rem',
                padding: '0.75rem 1.5rem',
                background: '#5f27cd',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: '500'
              }}
            >
              {i18n.t('error.reload')}
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
