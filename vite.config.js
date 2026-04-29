import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    include: ['src/test/**/*.test.{js,jsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{js,jsx}'],
      // Exclusiones alineadas con sonar-project.properties:
      // - Codigo 3D (Three.js / R3F): validacion visual, no automatizable
      // - Componentes Dashboard: validados visualmente y por tests E2E
      // - Header/footer visuales: presentacion pura, sin logica de negocio
      // - i18n / data / assets: datos estaticos
      // - main.jsx / App.jsx: bootstrap React
      exclude: [
        'src/test/**',
        'src/main.jsx',
        'src/App.jsx',
        'src/i18n/**',
        'src/data/**',
        'src/assets/**',
        'src/components/Universe/**',
        'src/components/Dashboard/**',
        'src/components/QuantumBackground.jsx',
        'src/components/QuantumDivider.jsx',
        'src/components/BlochSphere.jsx',
        'src/components/EntanglementLines.jsx',
        'src/components/WavefunctionCollapse.jsx',
        'src/components/LanguageSelector.jsx',
        'src/components/BackendStatusBadge.jsx',
        'src/components/LastUpdatedBadge.jsx',
        'src/components/BellCircuit.jsx',
        'src/components/FooterExtra.jsx',
        'src/components/TaglineRotator.jsx',
        'src/components/LogoQuantumParticles.jsx',
        'src/components/Tooltip.jsx',
      ],
    },
  },
})
