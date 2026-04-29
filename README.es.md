<div align="center">

<sub><a href="./README.md">🇬🇧 English</a>  ·  🇪🇸 <b>Español</b></sub>

# Entangle&nbsp;Visualizer

**Dashboard interactivo del ecosistema de computación cuántica de código abierto.**

Explora organizaciones, repositorios, desarrolladores y sus redes de colaboración a través de una web app rápida, animada y multi-idioma.

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Three.js](https://img.shields.io/badge/Three.js-R3F-000000?logo=threedotjs&logoColor=white)](https://threejs.org/)
[![Recharts](https://img.shields.io/badge/Recharts-3-FF6384)](https://recharts.org/)
[![i18n](https://img.shields.io/badge/i18n-5%20idiomas-4DB6AC)](./src/i18n/locales)
[![Azure Static Web Apps](https://img.shields.io/badge/Azure-Static%20Web%20Apps-0078D4?logo=microsoftazure&logoColor=white)](https://azure.microsoft.com/products/app-service/static)
[![Tests](https://img.shields.io/badge/tests-vitest-FCC72B?logo=vitest&logoColor=black)](./src/test)
[![Cobertura](https://img.shields.io/badge/cobertura-62%25-brightgreen?logo=codecov&logoColor=white)](#calidad--an%C3%A1lisis-est%C3%A1tico)
[![Quality Gate](https://img.shields.io/badge/quality%20gate-passed-brightgreen?logo=sonarqube&logoColor=white)](#calidad--an%C3%A1lisis-est%C3%A1tico)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

[**Abrir app**](https://blue-rock-0771cc403.1.azurestaticapps.net) ·
[**Repo del backend**](https://github.com/Angel-TFG-UCLM/Entangle-Core) ·
[**Reportar un bug**](https://github.com/Angel-TFG-UCLM/Entangle-Visualizer/issues)

</div>

---

## Descripción

**Entangle Visualizer** es el frontend del proyecto [Entangle](https://github.com/Angel-TFG-UCLM/Entangle-Core): un dashboard de calidad investigadora que te permite navegar el ecosistema global de computación cuántica de código abierto en GitHub.

Consume la API de [Entangle Core](https://github.com/Angel-TFG-UCLM/Entangle-Core) y convierte sus datos en KPIs, gráficos interactivos, un grafo de colaboración explorable, una vista 3D del "universo cuántico" y un asistente IA integrado, con un lenguaje visual cuántico y soporte multi-idioma completo.

> Desarrollado como componente frontend de un Trabajo Fin de Grado en la **Universidad de Castilla-La Mancha (UCLM)**.

---

## Tabla de contenidos

- [Lo más destacado](#lo-más-destacado)
- [Capturas](#capturas)
- [Stack tecnológico](#stack-tecnológico)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Primeros pasos](#primeros-pasos)
- [Configuración](#configuración)
- [Scripts disponibles](#scripts-disponibles)
- [Internacionalización](#internacionalización)
- [Rendimiento](#rendimiento)
- [Tests](#tests)
- [Calidad & Análisis Estático](#calidad--análisis-estático)
- [Despliegue](#despliegue)
- [Roadmap](#roadmap)
- [Contribuir](#contribuir)
- [Licencia](#licencia)
- [Agradecimientos](#agradecimientos)

---

## Lo más destacado

- **Dashboard en tiempo real.** KPIs, top de organizaciones / repositorios / desarrolladores, distribución de lenguajes, todo gestionado por un store centralizado de [Zustand](https://zustand-demo.pmnd.rs/).
- **Grafo de colaboración interactivo.** Red force-directed de contribuidores y organizaciones renderizada con [`react-force-graph-2d`](https://github.com/vasturiano/react-force-graph), con filtros, drill-down y tooltips.
- **Vista 3D del "universo cuántico".** Escena inmersiva en Three.js construida sobre [`@react-three/fiber`](https://docs.pmnd.rs/react-three-fiber) y post-procesado, con lazy-load para no engordar el bundle inicial.
- **Asistente IA en el chat.** Chat flotante conectado al agente de Azure AI Foundry del backend, para preguntas en lenguaje natural sobre el dataset en vivo.
- **Estética cuántica.** Esferas de Bloch, colapso de función de onda y animaciones de entrelazamiento, además de fórmulas KaTeX en el glosario integrado.
- **UI multi-idioma.** i18n completa en **inglés, español, francés, alemán y portugués** vía `i18next` con detección automática.
- **Herramientas de comparación.** Radar de comparación entre organizaciones, Sankey de contribuidores, tabla de bridge users y mapa de tech stack.
- **Pensado para rendimiento.** Code splitting, rutas lazy, web workers (`computeLayout`, `computeDetailData`), GZip de extremo a extremo y caché permanente de métricas en el backend.
- **Responsive y accesible.** Diseño mobile-first, tema oscuro, controles navegables por teclado, HTML semántico.
- **Hosting de producción.** Desplegado en **Azure Static Web Apps** con CI/CD vía GitHub Actions y enrutado SPA mediante `staticwebapp.config.json`.

---

## Capturas

Las capturas de las vistas del dashboard (KPIs, red de colaboración, universo cuántico, chat con IA) están disponibles en la aplicación desplegada en [blue-rock-0771cc403.1.azurestaticapps.net](https://blue-rock-0771cc403.1.azurestaticapps.net).

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| **Framework** | React 19, React Router 7 |
| **Bundler / dev server** | Vite 7 (`@vitejs/plugin-react-swc`) |
| **State management** | Zustand 5 |
| **Data fetching** | Axios |
| **Charts** | Recharts 3 |
| **Network graph** | `react-force-graph-2d` |
| **3D / VFX** | Three.js, `@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing` |
| **Iconos** | `lucide-react`, `react-icons` |
| **Markdown / matemáticas** | `react-markdown`, `remark-gfm`, `remark-math`, `rehype-katex`, KaTeX |
| **i18n** | `i18next`, `react-i18next`, `i18next-browser-languagedetector` |
| **Tooling** | ESLint 9, SWC, CSS Modules |
| **Hosting** | Azure Static Web Apps |

---

## Estructura del proyecto

```
Frontend/
├── src/
│   ├── components/
│   │   ├── Dashboard/           # KPIs, charts, grafo, tablas, admin, chat
│   │   ├── Universe/            # Escena 3D + transiciones Big Bang / Black Hole
│   │   ├── BlochSphere.jsx      # Visuales cuánticas
│   │   ├── EntanglementLines.jsx
│   │   ├── WavefunctionCollapse.jsx
│   │   ├── QuantumBackground.jsx
│   │   └── LanguageSelector.jsx
│   ├── services/                # Cliente API (Axios)
│   ├── store/                   # Stores de Zustand (dashboard, favorites, dev)
│   ├── hooks/                   # Hooks de React custom
│   ├── i18n/                    # Configuración de i18next + locales (en/es/fr/de/pt)
│   ├── data/                    # Datos mock de fallback
│   └── App.jsx                  # Layout y enrutado
├── public/                      # Assets estáticos
├── scripts/                     # Scripts de build / utilidades
├── docs/                        # Documentación y assets
├── staticwebapp.config.json     # Routing y headers de Azure SWA
├── vite.config.js
└── package.json
```

---

## Primeros pasos

### Prerrequisitos

- **Node.js 20+** y **npm** (o pnpm / yarn)
- Una instancia accesible de [Entangle Core](https://github.com/Angel-TFG-UCLM/Entangle-Core) (local o desplegada)

### 1. Clonar

```bash
git clone https://github.com/Angel-TFG-UCLM/Entangle-Visualizer.git
cd Entangle-Visualizer
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar variables de entorno

```bash
cp .env.example .env.local
# Edita .env.local y apunta VITE_API_URL a tu backend
```

### 4. Lanzar el servidor de desarrollo

```bash
npm run dev
```

La app queda disponible en **http://localhost:5173**.

> Tip: si el backend está caído, la app cae a datos mock para que puedas seguir desarrollando la UI.

---

## Configuración

Vite expone al cliente las variables de entorno con prefijo `VITE_` (ver [`.env.example`](./.env.example)):

| Variable | Descripción | Ejemplo |
|---|---|---|
| `VITE_API_URL` | URL base de la API de Entangle Core (debe incluir `/api/v1`). | `http://localhost:8000/api/v1` |
| `VITE_DEBUG` | Activa logging detallado en la consola del navegador. | `true` |

---

## Scripts disponibles

| Script | Propósito |
|---|---|
| `npm run dev` | Lanza el servidor de Vite con HMR. |
| `npm run build` | Construye el bundle de producción en `dist/`. |
| `npm run preview` | Previsualiza el build de producción en local. |
| `npm run lint` | Ejecuta ESLint sobre el código. |

---

## Internacionalización

Entangle Visualizer trae traducciones completas en:

| Código | Idioma |
|---|---|
| `en` | Inglés |
| `es` | Español |
| `fr` | Francés |
| `de` | Alemán |
| `pt` | Portugués |

Las traducciones viven en [`src/i18n/locales/`](./src/i18n/locales) y las carga `i18next` con detección automática del idioma del navegador. Añadir un nuevo idioma es tan simple como soltar un nuevo JSON y registrarlo en [`src/i18n/index.js`](./src/i18n/index.js).

---

## Rendimiento

Algunas técnicas usadas para mantener el dashboard fluido con datasets reales:

- **Lazy loading** para la pesada vista 3D del Universe (el bundle de Three.js solo se descarga bajo demanda).
- **Web workers** para los cálculos de layout y detalle, manteniendo el hilo principal libre.
- **Caché de métricas en el servidor** dentro de MongoDB, devolviendo payloads pre-calculados.
- **Compresión GZip** de extremo a extremo (middleware de FastAPI + Azure SWA).
- **CSS Modules** para estilos con scope y dead-code-friendly.
- **Skeletons y fallbacks elegantes** mientras los datos cargan o el backend no está accesible.

---

## Tests

Los tests unitarios se ejecutan con **Vitest** + **@testing-library/react**:

```bash
# Ejecutar la suite completa
npm test

# Con cobertura (genera coverage/lcov.info)
npm run test:coverage
```

La suite cubre los stores de Zustand, la capa HTTP, hooks personalizados y el
componente `ErrorBoundary`. Las escenas 3D y los componentes puramente visuales
se excluyen de la métrica de cobertura por diseño (se validan visualmente).

---

## Calidad & Análisis Estático

El código se analiza con **SonarQube Community Edition** (auto-hospedado en Docker) contra una Quality Gate personalizada llamada **«Entangle»**, definida en la memoria del Trabajo Fin de Grado del proyecto. La gate impone nueve condiciones:

| Métrica | Operador | Umbral |
|---|---|---|
| Reliability Rating | ≤ | C |
| Security Rating | ≤ | A |
| Maintainability Rating | ≤ | B |
| Cobertura | ≥ | 60 % |
| Densidad de líneas duplicadas | ≤ | 5 % |
| Duplicación en código nuevo | ≤ | 3 % |
| Issues nuevos | ≤ | 0 |
| Security Hotspots revisados | ≥ | 80 % |
| Vulnerabilidades | ≤ | 0 |

**Últimos resultados para `entangle-frontend`**:

| Métrica | Valor |
|---|---|
| Líneas de código | 14 040 |
| Ficheros | 34 |
| **Quality Gate** | ✅ **PASSED** |
| Cobertura | **62,6 %** |
| Líneas duplicadas | **4,5 %** |
| Bugs | 0 (severidad baja, aceptados) |
| Vulnerabilidades | 0 |
| Security Hotspots revisados | 100 % |
| Fiabilidad / Seguridad / Mantenibilidad | **A / A / A** |

Un segundo análisis se ejecuta automáticamente en cada push vía SonarQube Cloud (plan gratuito) en <https://sonarcloud.io/project/overview?id=Angel-TFG-UCLM_Entangle-Visualizer>. El plan gratuito de cloud aplica la gate built-in *Sonar way*; la gate personalizada **«Entangle»** se aplica en local.

Para reproducir el análisis local:

```powershell
$env:SONAR_LOCAL_TOKEN = "squ_xxxxxxxxxxxx"
./scripts/Run-LocalSonar.ps1
```

Ver [`LOCAL_SONAR.md`](../LOCAL_SONAR.md) para instrucciones de configuración completas.

---

## Despliegue

La app está alojada en **Azure Static Web Apps** y se construye y despliega automáticamente con GitHub Actions en cada push a `main`:

- Workflow: [`.github/workflows/azure-static-web-apps-blue-rock-0771cc403.yml`](./.github/workflows)
- Routing SPA y headers de seguridad: [`staticwebapp.config.json`](./staticwebapp.config.json)
- La URL de la API de producción se inyecta en el build vía la variable `VITE_API_URL` definida en el workflow.

Para un despliegue manual:

```bash
npm run build
# luego sube el contenido de `dist/` a tu hosting estático preferido
```

---

## Roadmap

- Ampliar las capacidades del asistente IA con análisis más profundos e insights proactivos.
- Expandir la cobertura a otras plataformas más allá de GitHub (GitLab, Hugging Face, arXiv).
- Añadir vistas de predicción de tendencias del ecosistema (crecimiento, herramientas emergentes, contribuidores en alza).

---

## Contribuir

Las contribuciones son bienvenidas. El flujo recomendado es:

1. Abre un issue describiendo el cambio.
2. Haz fork y crea una rama de feature (`git checkout -b feat/mi-feature`).
3. Ejecuta `npm run lint` y verifica que la app builda (`npm run build`) antes de enviar.
4. Abre un pull request contra `main` describiendo motivación y cambio.

---

## Licencia

Publicado bajo la [Licencia MIT](./LICENSE).

---

## Agradecimientos

- A la **Universidad de Castilla-La Mancha (UCLM)** y al tutor académico de este TFG, **Ricardo Pérez del Castillo** ([@ricpdc](https://github.com/ricpdc)).
- A los mantenedores de **React**, **Vite**, **Three.js**, **Recharts**, **Zustand**, **i18next** y al ecosistema JavaScript en general.
- Inspiración en los dashboards públicos de las comunidades de **Qiskit**, **Cirq** y **PennyLane**.

<div align="center">

Hecho con mucho café y curiosidad por **Ángel Luis Lara Martín** · [Entangle Core →](https://github.com/Angel-TFG-UCLM/Entangle-Core)

</div>
