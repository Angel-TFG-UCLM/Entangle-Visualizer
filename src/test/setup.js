import '@testing-library/jest-dom'

// Mock import.meta.env for tests
if (!import.meta.env.VITE_API_URL) {
  import.meta.env.VITE_API_URL = 'http://localhost:8000/api/v1'
}
