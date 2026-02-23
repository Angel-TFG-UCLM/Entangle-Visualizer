# Dashboard ENTANGLE — Documentación para la Memoria del TFG

> Documento técnico-descriptivo del módulo Dashboard del sistema ENTANGLE (Quantum Universe).
> Diseñado para su inclusión en la memoria del Trabajo Fin de Grado.

---

## 1. Visión General

El Dashboard constituye la interfaz principal de análisis del sistema ENTANGLE. Su función es presentar, de forma interactiva y visualmente coherente, toda la información extraída y enriquecida del ecosistema de software cuántico en GitHub.

### 1.1 Objetivos del Dashboard

1. **Visualizar** el estado del ecosistema quantum: repositorios, usuarios y organizaciones indexados.
2. **Explorar** relaciones de colaboración entre entidades mediante grafos interactivos.
3. **Filtrar** la información de forma cruzada (por organización, lenguaje, repositorio).
4. **Personalizar** la experiencia con un sistema de favoritos, búsqueda unificada y vistas guardadas.
5. **Comunicar** los datos con una identidad visual propia inspirada en conceptos de mecánica cuántica.

### 1.2 Stack Tecnológico

| Capa | Tecnología | Justificación |
|---|---|---|
| Framework UI | React 18 | Componentización, virtual DOM, ecosistema maduro |
| Bundler | Vite | Hot Module Replacement rápido, build optimizado |
| Estado global | Zustand | Ligero (< 1 KB), API mínima, sin boilerplate |
| Gráficos | Recharts | Basada en D3 pero con API declarativa React |
| Estilos | CSS Modules | Scoping automático, sin conflictos de clase |
| Iconografía | Lucide React | Consistente, ligera, tree-shakeable |
| HTTP | Axios | Interceptores, retry, timeout configurable |
| 3D (Universe) | Three.js + React Three Fiber | Renderizado GPU del grafo 3D de colaboración |
| Despliegue | Azure Static Web Apps | CDN global, integración CI/CD con GitHub |

---

## 2. Arquitectura del Dashboard

### 2.1 Patrón Arquitectónico

El Dashboard sigue un patrón **Single Source of Truth** con flujo unidireccional de datos:

```
┌─────────────────────────────────────────────────────────────────┐
│                        Backend (FastAPI)                        │
│  MongoDB (Cosmos DB vCore) → Métricas pre-calculadas + Caché   │
└──────────────────────────┬──────────────────────────────────────┘
                           │ REST API (JSON)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Capa de Servicios (api.js)                  │
│     Axios instance · Interceptores · Retry · Timeout 30s       │
└──────────────────────────┬──────────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
┌──────────────────────┐ ┌──────────────────────────┐
│   dashboardStore.js  │ │    favoritesStore.js      │
│   (Zustand)          │ │    (Zustand)              │
│                      │ │                           │
│ • KPIs, Charts,      │ │ • Favoritos jerárquicos   │
│   Graph, Tables      │ │ • Vistas personalizadas   │
│ • Filtros activos    │ │ • Vista activa + datos    │
│ • Estado colaboración│ │ • Export/Import           │
│ • Selección multi    │ │                           │
└──────────┬───────────┘ └─────────────┬────────────┘
           │                           │
           └─────────┬─────────────────┘
                     │ Suscripción selectiva
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Componentes React                            │
│                                                                 │
│  App.jsx (Layout + Loading + Health check + Routing)            │
│  ├── ViewBar          → Indicador de vista activa               │
│  ├── FavoritesPanel   → Búsqueda + Favoritos + Detalle inline  │
│  ├── KPISection       → Métricas principales animadas           │
│  ├── ChartsSection    → 4 gráficos interactivos + Detail Panel │
│  ├── CollaborationBanner → Portal al grafo de colaboración      │
│  ├── NetworkGraph     → Grafo SVG circular embebido             │
│  ├── DetailTable      → Tablas top repos + top contribuidores   │
│  ├── CollaborationPanel → Grafo fullscreen de colaboración      │
│  └── DashboardNav     → Dock flotante de navegación             │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Estrategia de Rendimiento

El backend **pre-calcula y cachea** todas las métricas en una colección `metrics` de MongoDB. El frontend nunca carga documentos raw completos — solo las métricas pre-agregadas necesarias para cada vista. Esto permite escalar el dashboard a miles de entidades sin degradar el rendimiento del cliente.

| Estrategia | Implementación |
|---|---|
| Pre-cálculo en servidor | KPIs, charts, tablas y grafo se calculan y cachean en MongoDB (~1h TTL) |
| Carga diferida | `UniverseView` (Three.js, ~600 KB) se carga con `React.lazy` + Suspense |
| Scroll reveal | Los componentes se animan solo al entrar en el viewport (IntersectionObserver) |
| Filtrado servidor | Los filtros se aplican en el backend, devolviendo solo datos relevantes |
| Reutilización de conexión | Singleton `CosmosClient` / `MongoRepository` sin reinstanciación |

---

## 3. Componentes del Dashboard

### 3.1 App.jsx — Orquestador Principal

El componente raíz que gestiona el ciclo de vida completo de la aplicación:

**Pantalla de carga cuántica:** Al iniciar, se muestra una animación con un átomo SVG orbital (3 órbitas elípticas con partículas animadas). Frases rotativas ambientan la espera: *"Inicializando qubits..."*, *"Entrelazando datos cuánticos..."*, *"Colapsando funciones de onda..."*. El resultado se comunica visualmente con check verde (éxito) o X roja (fallo).

**Health check con resiliencia:** Se ejecuta un ping al backend con retry exponencial (3 reintentos: 2s, 4s, 6s). Si el backend no responde, la aplicación entra en **modo offline** con datos simulados (mockData) y un banner de *"Decoherencia detectada"*.

**Barra de estado cuántica:** El header muestra el estado de conexión con notación de Dirac:
- `|1⟩` — Backend online (verde)
- `|0⟩` — Backend offline (rojo)
- `α|0⟩+β|1⟩` — Verificando conexión (amarillo, superposición)

**Layout vertical de secciones:** Header → ViewBar → KPISection → ChartsSection → CollaborationBanner → NetworkGraph → DetailTable → Footer (con circuito cuántico SVG del par de Bell).

### 3.2 KPISection — Métricas Principales

Grid de 3 tarjetas que presentan los conteos principales del ecosistema:

| Tarjeta | Dato | Icono |
|---|---|---|
| Repositorios | Total de repos quantum indexados | Database |
| Colaboradores | Total de usuarios únicos | Users |
| Organizaciones | Total de organizaciones | Building2 |

**Números animados:** Cada valor cuenta desde 0 hasta el valor real con easing exponencial (1500 ms en carga inicial, 400 ms en transiciones). La animación se dispara únicamente al entrar en viewport.

**Elementos decorativos cuánticos:** Cada tarjeta incluye una Esfera de Bloch en la esquina superior y un efecto de colapso de función de onda en la base, ambos reactivos al hover del usuario.

**Filtros:** Cuando hay filtros activos en el dashboard, se muestra un badge `|FILTERED⟩` indicando que los valores reflejan un subconjunto filtrado.

**Prioridad de datos:** Vista activa (si existe) → KPIs pre-calculados del backend → Cálculo fallback desde datos raw.

### 3.3 ChartsSection — Gráficos Interactivos

El componente más extenso del dashboard (~2400 líneas), contiene cuatro visualizaciones interactivas con Recharts:

#### 3.3.1 Top Organizaciones
- **Tipo:** BarChart horizontal
- **Métrica:** Número de repositorios quantum
- **Interacción:** Click en barra → filtra todo el dashboard por esa organización

#### 3.3.2 Top Repositorios
- **Tipo:** BarChart horizontal con selector de métrica
- **Métricas seleccionables:** Estrellas, Forks, Contribuidores
- **Interacción:** Click en barra → filtra por repositorio

#### 3.3.3 Top Usuarios (Contribuidores)
- **Tipo:** BarChart horizontal
- **Métrica:** Collaboration Score (√(contribuciones × repos × 100))
- **Interacción:** Click normal → abre panel de detalle; Ctrl+Click → analiza su red de colaboración
- **Filtro de tipo:** Toggle entre `todos`, `humanos`, `bots` con detección automática de bots por patrones en el login (`[bot]`, `-bot`, `dependabot`, etc.)

#### 3.3.4 Distribución de Lenguajes
- **Tipo:** PieChart
- **Datos:** Top 6 lenguajes por frecuencia + categoría "Otros"
- **Interacción:** Click en sector → filtra por lenguaje

#### Panel de Detalle de Entidad

Al hacer click en cualquier barra, se despliega un aside lateral con información completa:

- **Cabecera:** Avatar, nombre, tipo de entidad, bio o descripción
- **Badges contextuales:** Verificada, Quantum Focus > X%, Fork, Archivado, Disponible para contratar, Quantum Expert
- **Estadísticas:** Grid de 4 columnas con métricas específicas por tipo de entidad
- **Metadatos:** Ubicación, email, sitio web, fecha de creación, links a GitHub
- **Acciones:** Filtrar por la entidad, añadir a favoritos (⭐), ver red de colaboración (solo usuarios)

#### Filtrado Cruzado

Todas las selecciones son de tipo **toggle** (click para activar, click de nuevo para desactivar). Al seleccionar una entidad, esta se resalta con color magenta (#FF3CAC) y un `FilterBadge` animado muestra el filtro activo con ciclo de animación completo (entrada → visible → cambio → salida).

Los filtros son **mutuamente coherentes**: seleccionar una organización limpia la selección de repositorio y viceversa, evitando combinaciones inválidas.

### 3.4 FavoritesPanel — Panel de Favoritos y Búsqueda

Panel deslizable lateral que combina tres funcionalidades:

#### 3.4.1 Búsqueda Unificada

Barra de búsqueda que consulta el endpoint `GET /search/entities` con debounce. Los resultados muestran:
- Icono coloreado por tipo: Organización (cyan #00D4E4), Repositorio (púrpura #9D6FDB), Usuario (verde #00ff9f)
- Nombre y descripción truncada
- Botón de favorito con acción independiente (stopPropagation)
- Click en resultado → carga detalle completo vía `GET /search/entity/{id}`

#### 3.4.2 Detalle Inline de Entidad

Al seleccionar un resultado, se expande un panel inline con:
- **Identidad:** Avatar, nombre, tipo, bio
- **Badges:** Contextuales según tipo (Verificada, Fork, Quantum Expert score, etc.)
- **Estadísticas por tipo:**
  - **Usuarios:** Collab Score, Contribuciones Quantum, Seguidores, Repos Quantum (métricas consistentes con el Dashboard, calculadas en el backend)
  - **Repositorios:** Estrellas, Forks, Contribuidores, Watchers
  - **Organizaciones:** Repos Quantum, Total Estrellas, Repos Públicos, Miembros
- **Acciones:** Añadir/quitar favorito (⭐), abrir en GitHub (🔗), ver red de colaboración (🌐, solo usuarios)

#### 3.4.3 Sistema de Favoritos Jerárquico

Los favoritos se organizan en un árbol con herencia unidireccional:
- **Organizaciones** → se expanden mostrando sus repositorios quantum
- **Repositorios** → se expanden mostrando sus colaboradores
- **Usuarios** → nodo hoja (no expandible)

Los **Bridge Users** (usuarios que contribuyen a múltiples repositorios, conectando equipos) se destacan con un indicador visual especial (punto dorado).

Los datos de hijos se cargan bajo demanda (lazy loading) vía `GET /favorites/{id}/children`.

#### 3.4.4 Vistas Personalizadas

El usuario puede crear **colecciones nombradas** de entidades favoritas (vistas). Cada vista tiene:
- Nombre personalizable
- Color asignable (paleta de 8 colores)
- Lista de entidades incluidas

Al **activar una vista**, todo el dashboard se filtra para mostrar exclusivamente las entidades de esa colección. La `ViewBar` superior indica qué vista está activa y permite desactivarla.

Las vistas y favoritos son **exportables/importables** como JSON para compartir configuraciones entre sesiones.

### 3.5 NetworkGraph — Grafo Circular Embebido

Visualización SVG estática del ecosistema con layout circular:

| Capa | Entidad | Tamaño nodo | Color |
|---|---|---|---|
| Interior | Organizaciones | 18px | Cyan #00f7ff |
| Medio | Top 15 Repos (por estrellas) | 14px | Púrpura #bd00ff |
| Exterior | Top 30 Usuarios (por expertise) | 12px | Verde #00ff9f |

**Links** entre nodos representan relaciones: org↔repo (propiedad), user↔org (membresía), user↔repo (colaboración). El grafo reacciona a los filtros activos del dashboard, resaltando únicamente las entidades que cumplen los criterios seleccionados.

### 3.6 CollaborationBanner — Portal Cuántico

Banner inmersivo que aparece automáticamente cuando el backend detecta patrones de colaboración real entre entidades del ecosistema. Su diseño emula un "portal cuántico":

- **Fondo estelar:** 24 partículas con animaciones aleatorias
- **Átomo orbital SVG:** 3 órbitas elípticas (cyan, púrpura, verde) con partículas orbitando
- **Métricas previas:** Número de bridge users, repos conectados, y usuarios cross-org
- **Acción:** Click abre el `CollaborationPanel` en modo fullscreen

El banner es desestimable y solo se muestra una vez por sesión.

### 3.7 CollaborationPanel — Grafo Fullscreen de Colaboración

Overlay a pantalla completa con el grafo completo de colaboración auto-descubierto:

#### Grafo SVG Multicapa

| Anillo | Radio | Entidades | Estilo |
|---|---|---|---|
| Interior | 120px | Organizaciones | Nodos grandes, cyan, glow fuerte |
| Medio | 240px | Repositorios (con jitter) | Nodos medianos, púrpura |
| Exterior | 340px | Usuarios | Nodos pequeños, verdes; bridge users más grandes y dorados |

#### Animaciones del Grafo

- **Build animation:** Los nodos aparecen progresivamente con stagger
- **Pulsos de energía:** Partículas que recorren los links entre nodos (ráfaga inicial de 15 + pulsos ambientales cada 0.8–2.8 s)
- **Glow filters SVG:** Cuatro niveles (normal, fuerte, pulso, núcleo)
- **Hover interactivo:** Al pasar sobre un nodo, se destacan él y sus conexiones directas; el resto se atenúa

#### Sidebar Informativo

- **Métricas de red:** Bridge Users, pares conectados, usuarios cross-org, densidad (%), nodos totales, enlaces totales
- **Bridge Users destacados:** Lista de usuarios que conectan múltiples repositorios
- **Repos más conectados:** Pares de repositorios con mayor número de colaboradores compartidos

**Interacción:** Click en un usuario cierra el panel y abre el análisis de su red personal de colaboración.

### 3.8 DetailTable — Tablas de Detalle

Grid de dos tablas complementarias, lado a lado:

#### Top Repositorios (por estrellas)

| Columna | Contenido |
|---|---|
| # | Numeración en notación de Dirac (\|1⟩, \|2⟩...) |
| Nombre | Nombre completo + descripción truncada |
| Organización | Badge clickable → filtro por org |
| Lenguaje | Badge coloreado (Python azul, Q# verde, Julia morado...) |
| Estrellas | Conteo de stargazers |
| Forks | Conteo de forks |

#### Top Contribuidores (por Quantum Expertise Score)

| Columna | Contenido |
|---|---|
| # | Notación de Dirac |
| Nombre | Avatar + @login |
| Expertise | Badge con nivel cuántico |
| Contribuciones | Total de contribuciones |
| Organizaciones | Tags clickables → filtro por org |

**Niveles de Quantum Expertise:**

| Rango | Nivel | Analogía Cuántica |
|---|---|---|
| ≥ 90 | Qubit Master | Dominio completo del qubit |
| ≥ 75 | Entangled | Fuertemente entrelazado con el ecosistema |
| ≥ 50 | Superposed | En superposición de estados |
| < 50 | Ground State | Estado fundamental |

### 3.9 DashboardNav — Dock de Navegación

Dock flotante lateral izquierdo con diseño glassmorphism que permite saltar entre secciones:

1. KPIs (icono Gauge)
2. Gráficos (icono BarChart3)
3. Red de Colaboración (icono Network)
4. Tablas de Detalle (icono Table2)

Aparece automáticamente al hacer scroll > 200 px. Detecta la sección visible con IntersectionObserver y marca la activa. Incluye botón "Volver arriba" en la parte inferior.

### 3.10 ViewBar — Indicador de Vista Activa

Barra compacta bajo el header que se muestra cuando hay una vista personalizada activa. Indica el nombre de la vista, su color, el conteo de entidades y un spinner durante la carga. Permite desactivar la vista con un botón "Dashboard global".

---

## 4. Gestión de Estado

### 4.1 dashboardStore (Zustand)

Store principal con patrón Observer. Estado organizado en bloques:

```
dashboardStore
├── Datos pre-calculados
│   ├── kpis          → { repos, users, orgs }
│   ├── charts        → { topOrgs, topRepos, topUsers, languages }
│   ├── graph         → { nodes, links }
│   ├── tables        → { repositories, users }
│   └── filters       → { organizations[], languages[] }
│
├── Filtros activos
│   ├── selectedOrg   → string | null (toggle)
│   ├── selectedLanguage → string | null (toggle)
│   └── selectedRepo  → string | null (toggle)
│
├── Colaboración
│   ├── collaborationMode → 'user' | 'repos' | 'orgs'
│   ├── selectedUser  → login del usuario analizado
│   ├── selectedRepos → [] multi-selección
│   ├── selectedOrgs  → [] multi-selección
│   ├── collaborationAvailable → bool
│   ├── collaborationDiscovery → datos del grafo
│   └── showCollaborationGraph → bool
│
└── Estado UI
    ├── isLoading      → carga inicial
    ├── isFiltering    → cambio de filtro (sin reset de animaciones)
    └── dataSource     → 'mock' | 'backend'
```

**Acciones principales:**

| Acción | Descripción |
|---|---|
| `loadFullData(force)` | Carga `GET /dashboard/stats` → actualiza todo el store + auto-descubre colaboración |
| `refreshMetrics()` | `POST /dashboard/refresh-metrics` → invalida cachés → recarga |
| `setFilter(type, value)` | Toggle de filtro + recarga datos filtrados del backend |
| `resetFilters()` | Limpia todos los filtros, vuelve a vista global |
| `selectUserForAnalysis(login)` | Activa análisis de red personal del usuario |
| `analyzeCollaboration()` | `POST /collaboration/analyze` con las selecciones actuales |
| `discoverCollaboration()` | `GET /collaboration/discover` → auto-discovery de patrones |

### 4.2 favoritesStore (Zustand)

Store dedicado a la personalización del usuario:

| Estado | Descripción |
|---|---|
| `favorites` | Lista de entidades favoritas (con herencia jerárquica) |
| `views` | Colecciones nombradas con color |
| `activeViewId` | ID de la vista activa (null = dashboard global) |
| `activeViewData` | KPIs y datos filtrados de la vista activa |
| `isLoadingViewData` | Estado de carga de la vista |

---

## 5. Capa de Servicios (API)

Instancia Axios centralizada con:
- **Base URL** configurable vía `VITE_API_URL`
- **Timeout:** 30 s (adaptado a cold starts de Azure Container Apps)
- **Interceptores:** Logging de requests y manejo centralizado de errores

### 5.1 Endpoints Consumidos

| Endpoint | Método | Descripción | Componente consumidor |
|---|---|---|---|
| `/` | GET | Health check | App.jsx |
| `/dashboard/stats` | GET | Métricas pre-calculadas (KPIs, charts, graph, tables) | dashboardStore |
| `/dashboard/refresh-metrics` | POST | Invalida cachés y recalcula | dashboardStore |
| `/search/entities` | GET | Búsqueda unificada (query + limit) | FavoritesPanel |
| `/search/entity/{id}` | GET | Detalle completo de entidad con métricas calculadas | FavoritesPanel |
| `/favorites/{id}/children` | GET | Hijos jerárquicos de una entidad | FavoritesPanel |
| `/favorites` | GET/POST/DELETE | CRUD de favoritos | favoritesStore |
| `/views` | GET/POST/DELETE | CRUD de vistas personalizadas | favoritesStore |
| `/views/{id}/data` | POST | Datos filtrados de una vista | favoritesStore |
| `/collaboration/discover` | GET | Auto-descubrimiento de patrones de colaboración | dashboardStore |
| `/collaboration/analyze` | POST | Análisis de colaboración (user/repos/orgs) | dashboardStore |
| `/collaboration/user/{login}` | GET | Red personal de un usuario | dashboardStore |
| `/collaboration/network-metrics` | GET | Métricas de centralidad, comunidades, bus factor | CollaborationPanel |
| `/collaboration/quantum-tunneling` | GET | Camino más corto entre entidades | UniverseView |

### 5.2 Consistencia de Métricas

Un aspecto crítico del diseño es que las métricas de usuario (Collab Score, contribuciones quantum, repos relevantes) se calculan con **lógica idéntica** en ambos puntos de acceso:

- **Dashboard** (`/dashboard/stats`): El backend pre-calcula las métricas durante el enrichment. El frontend aplica la fórmula √(contributions × repos × 100) sobre datos ya filtrados al ecosistema quantum.
- **Favoritos** (`/search/entity/user_{login}`): El backend ejecuta un pipeline de agregación MongoDB que cruza la colección de repositorios, extrae las contribuciones del usuario en repos quantum, y devuelve `_collab_score` pre-calculado.

En ambos caminos, el **umbral de relevancia** es idéntico: un repositorio es *relevante* para un usuario si este es owner o tiene más de 5 contribuciones. Esto garantiza que el mismo usuario muestre valores idénticos en cualquier punto del sistema.

---

## 6. Sistema de Diseño Cuántico

### 6.1 Identidad Visual

El Dashboard emplea una estética **dark-mode cyberpunk** con elementos visuales de mecánica cuántica:

**Paleta de colores:**

| Color | Hex | Uso |
|---|---|---|
| Cyan cuántico | `#00D4E4` | Organizaciones, acentos principales |
| Púrpura cuántico | `#9D6FDB` | Repositorios |
| Verde cuántico | `#00ff9f` | Usuarios, éxito |
| Dorado | `#ffbd00` | Bridge users, elementos especiales |
| Magenta eléctrico | `#FF3CAC` | Selección activa (única) |
| Naranja | `#F97316` | Chart accent 3 |
| Azul | `#3B82F6` | Chart accent 4 |
| Rosa | `#EC4899` | Chart accent 5 |

**Fondo:** Gradientes oscuros de `#1a1f2e` → `#0f1419` → `#0a0e14`.

**Efectos visuales:**
- **Glassmorphism:** `backdrop-filter: blur()` en paneles, nav dock y cards
- **Glow SVG:** Filtros `feGaussianBlur` + `feMerge` en cuatro niveles de intensidad
- **Partículas:** Componente `QuantumBackground` con partículas animadas flotantes

### 6.2 Metáforas Cuánticas

Cada concepto de mecánica cuántica tiene una correspondencia funcional en la interfaz:

| Concepto Cuántico | Manifestación en UI | Ubicación |
|---|---|---|
| Notación de Dirac (\|ψ⟩) | Estado del backend (\|1⟩ online, \|0⟩ offline), ranking en tablas (\|1⟩, \|2⟩...) | Header, DetailTable |
| Superposición (α\|0⟩+β\|1⟩) | Estado "verificando conexión" | Header status |
| Esfera de Bloch | Esfera 3D decorativa que colapsa al hover | KPISection |
| Colapso de función de onda | Efecto visual que colapsa al interactuar | KPISection |
| Entrelazamiento (Entanglement) | Nombre del proyecto (ENTANGLE), circuito del par de Bell | Footer, branding |
| Decoherencia | Estado offline: "Decoherencia detectada" | App.jsx banner |
| Quantum Tunneling | Búsqueda del camino más corto entre entidades | UniverseView |
| Bridge Users | Analogía a partículas que conectan sistemas aislados | CollaborationPanel |
| Niveles energéticos | Ground State → Superposed → Entangled → Qubit Master | DetailTable expertise |
| Ecuación de Schrödinger | iℏ ∂/∂t \|ψ⟩ = Ĥ \|ψ⟩ como elemento decorativo | Hero section |

### 6.3 Animaciones

| Animación | Técnica | Propósito |
|---|---|---|
| Scroll reveal | IntersectionObserver + staggered delays | Revelar componentes al hacer scroll |
| Números animados | Interpolación con easing exponencial | KPIs que cuentan de 0 al valor final |
| Pulsos de energía | SVG `animateMotion` con paths | Partículas recorriendo links del grafo |
| Átomo orbital | SVG con 3 órbitas elípticas animadas | Pantalla de carga + CollaborationBanner |
| FilterBadge | Ciclo de 5 estados CSS (hidden → entering → visible → changing → exiting) | Indicador de filtro activo en charts |
| Build animation | Stagger progresivo de nodos | Aparición del grafo de colaboración |
| entitySlideIn | Keyframe CSS de translate + opacity | Panel de detalle inline en Favoritos |

---

## 7. Funcionalidades de Interacción Avanzada

### 7.1 Filtrado Cruzado

El usuario puede filtrar todo el dashboard desde cualquier punto de entrada:

1. **Click en barra de chart** → Filtro por org, repo o lenguaje
2. **Click en badge de tabla** → Filtro por org o lenguaje
3. **Activar vista de favoritos** → Filtra por colección personalizada

Los filtros se propagan al backend, que devuelve datos re-calculados para el subconjunto filtrado. Los filtros son incompatibles entre sí (org y repo se excluyen mutuamente) y actúan como toggle.

### 7.2 Análisis de Colaboración

Tres modos de análisis:

| Modo | Activación | Resultado |
|---|---|---|
| **User focus** | Ctrl+Click en usuario o click en "Ver red" | Grafo egocéntrico del usuario: sus repos, co-colaboradores, conexiones |
| **Multi-repo** | Selección de varios repos → "Analizar" | Usuarios compartidos entre los repos seleccionados |
| **Multi-org** | Selección de varias orgs → "Analizar" | Colaboradores cruzados entre organizaciones |

### 7.3 Auto-Descubrimiento

Al cargar el dashboard, el store ejecuta automáticamente `discoverCollaboration()`. Si el backend detecta patrones reales de colaboración (bridge users, repos conectados, usuarios cross-org), activa el `CollaborationBanner` que invita al usuario a explorar el grafo completo.

### 7.4 Detalle Profundo de Entidades

Dos puntos de acceso al detalle de una entidad:
- **ChartsSection:** Aside deslizable con información completa + acciones de filtro
- **FavoritesPanel:** Panel inline expandible con estadísticas pre-calculadas + acciones

Ambos comparten la misma profundidad de información pero difieren en el contexto de uso (exploración vs consulta rápida).

---

## 8. Despliegue

### 8.1 Arquitectura de Despliegue

```
┌──────────────────────────────────┐
│    Azure Static Web Apps         │
│    (Frontend - CDN global)       │
│                                  │
│    entangle-frontend             │
│    .azurestaticapps.net          │
│                                  │
│    Build: Vite → dist/           │
│    Routing SPA: staticwebapp     │
│    .config.json                  │
└──────────────┬───────────────────┘
               │ HTTPS + CORS
               ▼
┌──────────────────────────────────┐
│    Azure Container Apps          │
│    (Backend - FastAPI)           │
│                                  │
│    ca-xxx-api                    │
│    .azurecontainerapps.io/api/v1 │
│                                  │
│    Docker: Dockerfile            │
│    DB: Azure Cosmos DB vCore     │
│    (MongoDB compatible)          │
└──────────────────────────────────┘
```

### 8.2 Variables de Entorno

| Variable | Desarrollo | Producción |
|---|---|---|
| `VITE_API_URL` | `http://localhost:8000/api/v1` | URL de Azure Container Apps |

---

## 9. Resumen de Archivos del Dashboard

| Archivo | Líneas | Responsabilidad |
|---|---|---|
| `App.jsx` | ~500 | Layout, loading, health check, routing |
| `ChartsSection.jsx` | ~2400 | 4 gráficos interactivos + entity detail panel |
| `ChartsSection.module.css` | ~1800 | Estilos de charts y detail panel |
| `FavoritesPanel.jsx` | ~1110 | Búsqueda, favoritos jerárquicos, detalle inline, vistas |
| `FavoritesPanel.module.css` | ~1340 | Estilos del panel de favoritos y detalle inline |
| `CollaborationPanel.jsx` | ~660 | Grafo fullscreen de colaboración |
| `CollaborationPanel.module.css` | ~500 | Estilos del overlay y sidebar |
| `CollaborationBanner.jsx` | ~145 | Portal cuántico animado |
| `CollaborationBanner.module.css` | ~200 | Estilos de estrellas y átomo orbital |
| `NetworkGraph.jsx` | ~490 | Grafo SVG circular embebido |
| `NetworkGraph.module.css` | ~180 | Estilos del grafo circular |
| `KPISection.jsx` | ~320 | Tarjetas KPI con números animados |
| `DetailTable.jsx` | ~300 | Tablas top repos + contribuidores |
| `DetailTable.module.css` | ~250 | Estilos de tablas |
| `DashboardNav.jsx` | ~160 | Dock flotante de navegación |
| `DashboardNav.module.css` | ~150 | Estilos glassmorphism del dock |
| `ViewBar.jsx` | ~57 | Indicador de vista activa |
| `ViewBar.module.css` | ~60 | Estilos de la barra de vista |
| `dashboardStore.js` | ~960 | Estado global del dashboard (Zustand) |
| `favoritesStore.js` | ~400 | Estado de favoritos y vistas (Zustand) |
| `api.js` | ~557 | Capa de servicios HTTP (Axios) |

**Total aproximado:** ~12 000 líneas de código en el módulo Dashboard.
