<div align="center">

<sub>🇬🇧 <b>English</b>  ·  <a href="./README.es.md">🇪🇸 Español</a></sub>

# Entangle&nbsp;Visualizer

**Interactive dashboard for the open-source quantum computing ecosystem.**

Explore organizations, repositories, developers and their collaboration networks through a fast, animated, multi-language web app.

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Three.js](https://img.shields.io/badge/Three.js-R3F-000000?logo=threedotjs&logoColor=white)](https://threejs.org/)
[![Recharts](https://img.shields.io/badge/Recharts-3-FF6384)](https://recharts.org/)
[![i18n](https://img.shields.io/badge/i18n-5%20languages-4DB6AC)](./src/i18n/locales)
[![Azure Static Web Apps](https://img.shields.io/badge/Azure-Static%20Web%20Apps-0078D4?logo=microsoftazure&logoColor=white)](https://azure.microsoft.com/products/app-service/static)
[![Tests](https://img.shields.io/badge/tests-vitest-FCC72B?logo=vitest&logoColor=black)](./src/test)
[![Coverage](https://img.shields.io/badge/coverage-62%25-brightgreen?logo=codecov&logoColor=white)](#testing)
[![Quality Gate](https://img.shields.io/badge/quality%20gate-passed-brightgreen?logo=sonarqube&logoColor=white)](#quality--code-analysis)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

[**Open app**](https://blue-rock-0771cc403.1.azurestaticapps.net) ·
[**Backend repo**](https://github.com/Angel-TFG-UCLM/Entangle-Core) ·
[**Report a bug**](https://github.com/Angel-TFG-UCLM/Entangle-Visualizer/issues)

</div>

---

## Overview

**Entangle Visualizer** is the front-end of the [Entangle](https://github.com/Angel-TFG-UCLM/Entangle-Core) project: a research-grade dashboard that lets you navigate the global open-source quantum computing ecosystem on GitHub.

It consumes the [Entangle Core](https://github.com/Angel-TFG-UCLM/Entangle-Core) API and turns its data into KPIs, interactive charts, an explorable collaboration graph, a 3D "quantum universe" view and a built-in AI assistant, with a quantum-inspired visual language and full multi-language support.

> Built as the front-end component of a Bachelor's Final Project (TFG) at the **University of Castilla-La Mancha (UCLM)**.

---

## Table of contents

- [Highlights](#highlights)
- [Screenshots](#screenshots)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Available scripts](#available-scripts)
- [Internationalisation](#internationalisation)
- [Performance](#performance)
- [Testing](#testing)
- [Quality & Code Analysis](#quality--code-analysis)
- [Deployment](#deployment)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)
- [Acknowledgements](#acknowledgements)

---

## Highlights

- **Real-time dashboard.** KPIs, top organizations / repositories / developers, language distribution, all driven by a centralised [Zustand](https://zustand-demo.pmnd.rs/) store.
- **Interactive collaboration graph.** Force-directed network of contributors and organizations rendered with [`react-force-graph-2d`](https://github.com/vasturiano/react-force-graph), with filtering, drill-down and tooltips.
- **3D "quantum universe" view.** Immersive Three.js scene built on [`@react-three/fiber`](https://docs.pmnd.rs/react-three-fiber) and post-processing, lazy-loaded to keep the initial bundle small.
- **AI chat assistant.** Floating chat connected to the backend's Azure AI Foundry agent, so users can ask natural-language questions over the live dataset.
- **Quantum-themed visuals.** Bloch spheres, wavefunction collapse and entanglement animations, plus KaTeX-rendered formulas in the in-app glossary.
- **Multi-language UI.** Full i18n in **English, Spanish, French, German and Portuguese** via `i18next` with browser language detection.
- **Comparison tools.** Organization comparison radar, contributor Sankey, bridge-user table and tech-stack map for in-depth analysis.
- **Performance-first.** Code splitting, lazy routes, web workers (`computeLayout`, `computeDetailData`), GZip transport and a permanent metric cache on the backend.
- **Responsive & accessible.** Designed mobile-first, dark theme, keyboard-navigable controls, semantic HTML.
- **Production-grade hosting.** Deployed to **Azure Static Web Apps** with CI/CD via GitHub Actions and SPA routing through `staticwebapp.config.json`.

---

## Screenshots

Screenshots of the dashboard views (KPIs, collaboration network, quantum universe, AI chat) are available in the deployed application at [blue-rock-0771cc403.1.azurestaticapps.net](https://blue-rock-0771cc403.1.azurestaticapps.net).

---

## Tech stack

| Layer | Technology |
|---|---|
| **Framework** | React 19, React Router 7 |
| **Bundler / dev server** | Vite 7 (`@vitejs/plugin-react-swc`) |
| **State management** | Zustand 5 |
| **Data fetching** | Axios |
| **Charts** | Recharts 3 |
| **Network graph** | `react-force-graph-2d` |
| **3D / VFX** | Three.js, `@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing` |
| **Icons** | `lucide-react`, `react-icons` |
| **Markdown / math** | `react-markdown`, `remark-gfm`, `remark-math`, `rehype-katex`, KaTeX |
| **i18n** | `i18next`, `react-i18next`, `i18next-browser-languagedetector` |
| **Tooling** | ESLint 9, SWC, CSS Modules |
| **Hosting** | Azure Static Web Apps |

---

## Project structure

```
Frontend/
├── src/
│   ├── components/
│   │   ├── Dashboard/           # KPIs, charts, graph, tables, admin, chat
│   │   ├── Universe/            # 3D scene + Big Bang / Black Hole transitions
│   │   ├── BlochSphere.jsx      # Quantum-themed visuals
│   │   ├── EntanglementLines.jsx
│   │   ├── WavefunctionCollapse.jsx
│   │   ├── QuantumBackground.jsx
│   │   └── LanguageSelector.jsx
│   ├── services/                # API client (Axios)
│   ├── store/                   # Zustand stores (dashboard, favorites, dev)
│   ├── hooks/                   # Custom React hooks
│   ├── i18n/                    # i18next config + locales (en/es/fr/de/pt)
│   ├── data/                    # Mock fallback data
│   └── App.jsx                  # Layout & routing
├── public/                      # Static assets
├── scripts/                     # Build / utility scripts
├── docs/                        # Documentation & assets
├── staticwebapp.config.json     # Azure SWA routing & headers
├── vite.config.js
└── package.json
```

---

## Getting started

### Prerequisites

- **Node.js 20+** and **npm** (or pnpm / yarn)
- A reachable instance of [Entangle Core](https://github.com/Angel-TFG-UCLM/Entangle-Core) (local or deployed)

### 1. Clone

```bash
git clone https://github.com/Angel-TFG-UCLM/Entangle-Visualizer.git
cd Entangle-Visualizer
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env.local
# Edit .env.local and point VITE_API_URL to your backend
```

### 4. Run the dev server

```bash
npm run dev
```

The app is now available at **http://localhost:5173**.

> Tip: if the backend is offline, the app falls back to mock data so you can keep developing the UI.

---

## Configuration

Vite exposes environment variables prefixed with `VITE_` to the client (see [`.env.example`](./.env.example)):

| Variable | Description | Example |
|---|---|---|
| `VITE_API_URL` | Base URL of the Entangle Core API (must include `/api/v1`). | `http://localhost:8000/api/v1` |
| `VITE_DEBUG` | Enables verbose logging in the browser console. | `true` |

---

## Available scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start the Vite dev server with HMR. |
| `npm run build` | Build the production bundle into `dist/`. |
| `npm run preview` | Preview the production build locally. |
| `npm run lint` | Run ESLint over the codebase. |

---

## Internationalisation

Entangle Visualizer ships with full translations in:

| Code | Language |
|---|---|
| `en` | English |
| `es` | Spanish |
| `fr` | French |
| `de` | German |
| `pt` | Portuguese |

Translations live in [`src/i18n/locales/`](./src/i18n/locales) and are loaded by `i18next` with automatic browser-language detection. Adding a new language is as simple as dropping a new JSON file and registering it in [`src/i18n/index.js`](./src/i18n/index.js).

---

## Performance

A few of the techniques used to keep the dashboard snappy on real datasets:

- **Lazy loading** for the heavy 3D Universe view (Three.js bundle is only fetched on demand).
- **Web workers** for layout and detail computations so the main thread stays responsive.
- **Server-side metric cache** in MongoDB so dashboard payloads come pre-computed.
- **GZip compression** end-to-end (FastAPI middleware + Azure SWA).
- **CSS Modules** for scoped, dead-code-friendly styling.
- **Skeletons & graceful fallbacks** while data is loading or the backend is unreachable.

---

## Testing

Unit tests run with **Vitest** + **@testing-library/react**:

```bash
# Run the full suite
npm test

# With coverage (writes to coverage/lcov.info)
npm run test:coverage
```

The suite covers Zustand stores, the HTTP service layer, custom hooks and the
`ErrorBoundary` component. 3D scenes and visual-only components are excluded
from coverage by design (they are validated visually).

---

## Quality & Code Analysis

Code is analysed with **SonarQube Community Edition** (self-hosted in Docker) against a custom Quality Gate called **«Entangle»**, defined in the project's Bachelor's Thesis report. The gate enforces nine conditions:

| Metric | Operator | Threshold |
|---|---|---|
| Reliability Rating | ≤ | C |
| Security Rating | ≤ | A |
| Maintainability Rating | ≤ | B |
| Coverage | ≥ | 60 % |
| Duplicated Lines Density | ≤ | 5 % |
| Duplication on New Code | ≤ | 3 % |
| New Issues | ≤ | 0 |
| Security Hotspots Reviewed | ≥ | 80 % |
| Vulnerabilities | ≤ | 0 |

**Latest results for `entangle-frontend`**:

| Metric | Value |
|---|---|
| Lines of code | 14 040 |
| Files | 34 |
| **Quality Gate** | ✅ **PASSED** |
| Coverage | **62.6 %** |
| Duplicated lines | **4.5 %** |
| Bugs | 0 (low severity, accepted) |
| Vulnerabilities | 0 |
| Security Hotspots reviewed | 100 % |
| Reliability / Security / Maintainability | **A / A / A** |

A second analysis runs automatically on every push via SonarQube Cloud (free plan) at <https://sonarcloud.io/project/overview?id=Angel-TFG-UCLM_Entangle-Visualizer>. The cloud free plan applies the built-in *Sonar way* gate; the custom **«Entangle»** gate is enforced locally.

To reproduce the local analysis:

```powershell
$env:SONAR_LOCAL_TOKEN = "squ_xxxxxxxxxxxx"
./scripts/Run-LocalSonar.ps1
```

See [`LOCAL_SONAR.md`](../LOCAL_SONAR.md) for full setup instructions.

---

## Deployment

The app is hosted on **Azure Static Web Apps** and built/deployed automatically by GitHub Actions on every push to `main`:

- Workflow: [`.github/workflows/azure-static-web-apps-blue-rock-0771cc403.yml`](./.github/workflows)
- SPA routing and security headers: [`staticwebapp.config.json`](./staticwebapp.config.json)
- Production API URL is injected at build time via the `VITE_API_URL` env var defined in the workflow.

For a manual deployment:

```bash
npm run build
# then upload the contents of `dist/` to your static host of choice
```

---

## Roadmap

- Expand the AI assistant with deeper analytical capabilities and proactive insights.
- Extend coverage to other platforms beyond GitHub (GitLab, Hugging Face, arXiv).
- Add ecosystem trend prediction views (forecasting growth, emerging tools, rising contributors).

---

## Contributing

Contributions are welcome. The recommended flow is:

1. Open an issue describing the change.
2. Fork and create a feature branch (`git checkout -b feat/my-feature`).
3. Run `npm run lint` and ensure the app builds (`npm run build`) before submitting.
4. Open a pull request against `main` describing the motivation and the change.

---

## License

Released under the [MIT License](./LICENSE).

---

## Acknowledgements

- **University of Castilla-La Mancha (UCLM)** and the academic tutor of this TFG, **Ricardo Pérez del Castillo** ([@ricpdc](https://github.com/ricpdc)).
- The maintainers of **React**, **Vite**, **Three.js**, **Recharts**, **Zustand**, **i18next** and the wider JavaScript ecosystem.
- Inspiration from the public dashboards of the **Qiskit**, **Cirq** and **PennyLane** communities.

<div align="center">

Built with lots of coffee and curiosity by **Ángel Luis Lara Martín** · [Entangle Core →](https://github.com/Angel-TFG-UCLM/Entangle-Core)

</div>
