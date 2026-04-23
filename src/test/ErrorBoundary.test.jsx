/**
 * Tests for ErrorBoundary component
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import ErrorBoundary from '../components/ErrorBoundary'

// Mock i18n
vi.mock('../i18n', () => ({
  default: {
    t: (key) => {
      const translations = {
        'error.title': 'Something went wrong',
        'error.message': 'An unexpected error occurred',
        'error.details': 'Technical details',
        'error.reload': 'Reload page',
      }
      return translations[key] || key
    },
  },
}))

// Component that throws on render
function ThrowingComponent({ shouldThrow = true }) {
  if (shouldThrow) {
    throw new Error('Test error')
  }
  return <div>Child rendered successfully</div>
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // Suppress console.error during error boundary tests
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={false} />
      </ErrorBoundary>
    )
    expect(screen.getByText('Child rendered successfully')).toBeInTheDocument()
  })

  it('renders fallback UI when child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    )
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByText('Reload page')).toBeInTheDocument()
  })

  it('shows error details in fallback', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    )
    expect(screen.getByText('Technical details')).toBeInTheDocument()
  })

  it('reload button is present', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    )
    const btn = screen.getByText('Reload page')
    expect(btn.tagName).toBe('BUTTON')
  })
})
