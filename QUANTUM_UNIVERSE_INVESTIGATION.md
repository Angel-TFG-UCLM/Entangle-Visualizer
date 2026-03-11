# Investigación Exhaustiva: Visualización 3D "Quantum Universe"

> **Proyecto**: ENTANGLE — TFG  
> **Ruta base**: `Frontend/src/components/Universe/`  
> **Líneas de código analizadas**: ~12.500 (9549 en UniverseView.jsx + 971 en computeDetailData.worker.js + 569 en computeLayout.worker.js + 142 en useEnrichedData.js + ~1295 en BigBangEntry.jsx + BlackHoleExit.jsx)

---

## Índice

1. [Archivos del componente](#1-archivos-del-componente)
2. [Algoritmo de bordes/fronteras (Jenks Natural Breaks)](#2-algoritmo-de-bordesfronteras-jenks-natural-breaks)
3. [Posicionamiento de entidades](#3-posicionamiento-de-entidades)
4. [Renderizado de entidades](#4-renderizado-de-entidades)
5. [Interacciones](#5-interacciones)
6. [Efectos visuales](#6-efectos-visuales)
7. [Flujo de datos](#7-flujo-de-datos)
8. [Configuración y constantes](#8-configuración-y-constantes)
9. [Gestión de estado](#9-gestión-de-estado)
10. [Filtrado y búsqueda](#10-filtrado-y-búsqueda)

---

## 1. Archivos del componente

| Archivo | Líneas | Rol |
|---------|--------|-----|
| `UniverseView.jsx` | 9549 | Componente principal: escena 3D, 30+ sub-componentes, UI completa, shaders GLSL |
| `computeLayout.worker.js` | 569 | Web Worker: posicionamiento de entidades en 3D (off main-thread) |
| `computeDetailData.worker.js` | 971 | Web Worker: analítica del panel de detalle (radar, health, impacto, similaridad) |
| `useEnrichedData.js` | 142 | Hook React: fusión de datos graph (ligeros) con datos backend (enriquecidos) |
| `BigBangEntry.jsx` | 592 | Animación de entrada: explosión Canvas2D de partículas |
| `BlackHoleExit.jsx` | 703 | Animación de salida: colapso gravitacional con clip-path circular |

**Stack tecnológico**:
- **React Three Fiber** (`@react-three/fiber`) — integración React ↔ Three.js
- **drei** (`@react-three/drei`) — OrbitControls, Html
- **postprocessing** — EffectComposer + Bloom (intensity=1.4, luminanceThreshold=0.2, radius=0.85)
- **Three.js** — InstancedMesh, ShaderMaterial, BufferGeometry, CatmullRomCurve3
- **Zustand** — dashboardStore (estado global)
- **Web Workers** — layout + detail computation off main-thread
- **GLSL** — 7+ programas shader custom (vertex + fragment)

---

## 2. Algoritmo de bordes/fronteras (Jenks Natural Breaks)

### 2.1 Fundamento matemático

Se implementa el algoritmo de **Fisher-Jenks (1958)** — también llamado **Jenks Natural Breaks** — para clasificar las organizaciones en 3 zonas concéntricas de forma 100% data-driven, sin umbrales arbitrarios.

**Archivo**: `computeLayout.worker.js`, líneas 30-90  
**Duplicado en**: `computeDetailData.worker.js`, líneas 39-82

### 2.2 Problema a resolver

Dado un array unidimensional de $n$ valores (scores de centralidad de organizaciones) y $k=3$ clases, encontrar las $k-1=2$ fronteras que **minimizan la suma de varianzas intra-clase (SDCM — Sum of Squared Deviations from Class Means)**.

### 2.3 El algoritmo paso a paso

```
ENTRADA: data[] = scores de centralidad, nClasses = 3
SALIDA: boundaries[] = [CORE_BOUNDARY, MID_BOUNDARY]
```

**Paso 1 — Ordenación**: Se clona y ordena el array ascendentemente:
```javascript
const sorted = [...data].sort((a, b) => a - b)
```

**Paso 2 — Programación dinámica**: Se construyen dos matrices:
- `lower[i][j]` — índice óptimo de inicio de la clase $j$-ésima para los primeros $i$ elementos
- `vari[i][j]` — mínimo SDCM acumulado para $j$ clases sobre los primeros $i$ elementos

Inicialización:
$$\text{vari}[1][j] = 0 \quad \forall j \in [1, k]$$
$$\text{vari}[i][j] = \infty \quad \forall i > 1$$

Recurrencia (para cada $l \in [2, n]$):
```
Para cada posición candidata m desde l hasta 1:
  w++, sum += val, sumSq += val²
  v = sumSq - sum²/w                      ← SSE del segmento [m, l]
  cost = v + vari[m-1][j-1]               ← SSE segmento + óptimo previo
  Si cost < vari[l][j]:
    lower[l][j] = m                        ← guardar punto de corte
    vari[l][j] = cost
```

**Complejidad**: $O(n^2 \cdot k)$ en tiempo, $O(n \cdot k)$ en espacio.

**Paso 3 — Backtracking**: Recorrer `lower[][]` hacia atrás para obtener los índices de inicio de cada clase:
```javascript
const classStarts = new Array(nClasses)
let k = n
for (let j = nClasses; j >= 2; j--) {
  classStarts[j-1] = lower[k][j] - 1
  k = lower[k][j] - 1
}
```

**Paso 4 — Boundaries**: La frontera entre cada par de clases adyacentes es el **punto medio** entre el último valor de una clase y el primero de la siguiente:
$$\text{boundary}_c = \frac{\text{sorted}[\text{classStarts}[c]-1] + \text{sorted}[\text{classStarts}[c]]}{2}$$

### 2.4 Uso en el layout

En `computeLayout.worker.js` (líneas 252-270):

1. Se extraen los `distances` radiales de todas las orgs ya posicionadas
2. Se ejecuta `jenksNaturalBreaks(distances, 3)` → `boundaries = [b0, b1]`
3. Las fronteras resultantes se almacenan como:
   - `CORE_BOUNDARY = boundaries[0]` — radio del núcleo
   - `MID_BOUNDARY = boundaries[1]` — radio de la zona intermedia

### 2.5 Visualización de las zonas

En `UniverseView.jsx`, el componente `ZoneBoundaries` (líneas 4585-4695) renderiza las tres zonas como esferas concéntricas:

| Zona | Color | Radio | Wireframe | Solid opacity |
|------|-------|-------|-----------|---------------|
| Core | `#00ff9f` verde | `coreRadius` | Sí (32 seg) | 0.03 |
| Intermedia | `#4488ff` azul | `peripheryMin` | Sí (48 seg) | 0.015 |
| Periférica | `#aa44ff` violeta | `peripheryMax` | Sí (64 seg) | 0.008 |

Cada esfera tiene una etiqueta HTML flotante que muestra el nombre de la zona y la cantidad de orgs contenidas.

### 2.6 Uso en el panel de detalle

En `computeDetailData.worker.js` (líneas 595-607), la **zona de una entidad** se determina por su distancia al origen vs. `zoneMeta`:

```
dist = √(x² + y² + z²)
if dist ≤ coreRadius     → "Zona Core"       ⬡ verde
if dist ≤ peripheryMin   → "Zona Intermedia"  ⬢ azul
else                      → "Zona Periférica"  ◯ violeta
```

### 2.7 Uso en roles de red

En `computeDetailData.worker.js` (líneas 610-680), Jenks se aplica TAMBIÉN para clasificar la centralidad y conectividad raw de las entidades (filtrando por tipo) en 3 clases: high/mid/low. Luego se usa una **matriz de roles 3×3** para asignar uno de 10 roles:

| Centrality \ Connectivity | High | Mid | Low |
|---|---|---|---|
| **High** | Hub Central ⊛ | Hub Colaborativo ⊛ | Puente Estratégico ⚡ |
| **Mid** | Conector Denso ◉ | Nodo Activo ◈ | Nodo Focalizado ◈ |
| **Low** | Conector Social ◉ | Nodo Emergente ◇ | Nodo Incipiente ◇ |

Si la muestra tiene $n < 6$, se usa fallback a tertiles simples.

---

## 3. Posicionamiento de entidades

### 3.1 Pipeline general

```
Backend data → dashboardStore → Web Worker (computeLayout) → processLayoutResultAsync → universeData → Scene
```

El Web Worker ejecuta un pipeline de 5 fases secuenciales:

### 3.2 FASE 1 — Grafo de colaboración inter-org (líneas 140-165)

Para cada repo, se extrae su org propietaria y sus usuarios. Dos orgs están conectadas cuando comparten al menos un contributor:

```
Para cada repo R:
  orgId = org dueña de R
  Para cada user U de R:
    Para cada otro repo R' donde U contribuye:
      orgId2 = org dueña de R'
      Si orgId ≠ orgId2: collaboration[orgId][orgId2] += peso(U)
```

El peso de un bridge user se multiplica por un factor especial (`quantumFocusWeight`).

### 3.3 FASE 2 — Score de centralidad por org (líneas 167-206)

Cada org recibe un score de centralidad. Se prefiere el `collab_centrality_raw` del backend (basado en datos reales de la API de GitHub). Si no existe, fallback a cálculo local:

$$\text{score}(o) = \sum_{o' \in \text{vecinos}} \text{collab\_weight}(o, o') \times \text{quantumFocusWeight}$$

### 3.4 FASE 3 — Posicionamiento de organizaciones (líneas 208-340)

**Centro del universo** = org con mayor score (posición `[0, 0, 0]`).

**Mapeo continuo logarítmico** del score al radio:
$$\text{normalized} = \frac{\log(1 + \text{score})}{\log(1 + \text{maxScore})}$$
$$\text{targetR} = \text{PERIPHERY\_MAX} \times (1 - \text{normalized}^{0.7})$$

Donde `PERIPHERY_MAX = 900 × scaleFactor` (el `scaleFactor` depende del número de orgs: >100 → 1.3, >60 → 1.15, >30 → 1.05, else → 1.0).

**Colocación estocástica con atracción de vecinos**: Para cada org (ordenadas por score descendente):

1. Se genera una posición angular aleatoria en esfera a radio `targetR`
2. Se evalúan hasta **80 intentos** con distintos ángulos aleatorios
3. Se penaliza la distancia a `targetR` y se premia la cercanía a orgs vecinas ya colocadas (connected neighbors)
4. Se verifica la **separación mínima** `MIN_SEP = 55 × scaleFactor` contra todas las orgs ya colocadas
5. Se elige la posición con mejor score combinado

**Clasificación Jenks**: Tras colocar todas las orgs, se ejecuta Jenks sobre las distancias radiales para obtener `CORE_BOUNDARY` y `MID_BOUNDARY`.

### 3.5 FASE 4 — Repositorios orbitando su org (líneas 355-400)

Cada repo se coloca en órbita alrededor de su org propietaria:

- **Radio de órbita**: proporcional al número de contributors del repo
  - `REPO_MIN_ORBIT = 18`, `REPO_MAX_ORBIT = 55 × scaleFactor`
  - Escala logarítmica: $r = \text{MIN} + (\text{MAX} - \text{MIN}) \times \frac{\log(1 + \text{contributors})}{\log(1 + \text{maxContributors})}$
- **Ángulo**: distribuido uniformemente + offset aleatorio para evitar alineamientos
- **Position**: esférica relativa al centro de la org

### 3.6 FASE 5 — Usuarios en centroide de sus repos (líneas 410-470)

Cada usuario se coloca en el **centroide ponderado** de los repos a los que contribuye:

$$\text{centroid} = \frac{1}{n} \sum_{i=1}^{n} \text{pos}(\text{repo}_i)$$

- Si el usuario contribuye a **un solo repo**: centroide directo con offset radial aleatorio (`USER_MIN_ORBIT=4` a `USER_MAX_ORBIT=10`)
- Si contribuye a **múltiples repos**: centroide de todos sus repos, orbitando a 0.6× el radio máximo del grupo

### 3.7 Output del worker

```javascript
{
  orgNodes, repoNodes, userNodes,     // Arrays de entidades
  orgRepos, repoUsers,                // Mapas de relación
  positions,                          // { [id]: {x, y, z} }
  connections,                        // Array de {source, target, type, strength}
  orgScore, orgNeighbors,             // Scoring y topología
  zoneMeta: {                         // Fronteras Jenks
    coreRadius, peripheryMin, peripheryMax,
    coreCount, midCount, isolatedCount
  }
}
```

### 3.8 processLayoutResultAsync

El resultado del worker se convierte a objetos THREE.Vector3 de forma **asíncrona y chunked** (500 posiciones/yield, 1000 conexiones/yield) para evitar bloquear el main thread durante la conversión.

---

## 4. Renderizado de entidades

### 4.1 Organizaciones — `QuantumProcessors` (líneas 622-800)

**Geometría**: Dual torus + esfera central
- Torus interno: R=2.8, tubo=0.25
- Torus externo: R=4, tubo=0.12 (rotado 90° en X)
- Esfera central: R=0.9 (emissive core)
- Hit sphere invisible: R=4.5 (para interacción click/hover)

**Material**:
- Color base: `#00f7ff` (cyan)
- `MeshStandardMaterial` con metalness=0.3, roughness=0.4
- Emissive: mezcla de base + color de lente activo
- `toneMapped: false` para sobresaturación luminosa (HDR → Bloom)

**Lens awareness**: Cada org interpola suavemente (LERP) entre su color base y el color asignado por la lente activa (communities, centrality, etc.).

### 4.2 Repositorios — `Qubits` (líneas 906-1045)

**Geometría**: Esfera con `SphereGeometry(0.55, 14, 14)`
- Escala dinámica por estrellas: 0.7 a 1.5 (logarítmica)
- Hit sphere invisible: R=2.5

**Material**: 
- Color base: `#bd00ff` (violeta)
- `MeshStandardMaterial` con metalness=0.2, roughness=0.6
- Emissive: mismo sistema de lente que orgs

### 4.3 Usuarios — `QuantumParticles` (líneas 1278-1600)

**Geometría**: GPU particles via `InstancedMesh` con `ShaderMaterial`

**GLSL Vertex Shader** (líneas 1155-1215):
```glsl
// Atributos por instancia
attribute float aIsBridge;    // 0.0 o 1.0
attribute float aBrightness;  // 0.0-1.0
attribute float aSeed;        // hash para aleatorización temporal
attribute vec3  aLensColor;   // color de lente asignado
attribute float aDensity;     // densidad de zona
attribute float aVisible;     // visibilidad temporal (0-1)

void main() {
  // Jitter de Heisenberg: desplazamiento aleatorio sinusoidal
  float jx = sin(uTime * 0.4 + aSeed * 9.1) * 0.5;
  float jy = cos(uTime * 0.47 + aSeed * 7.3) * 0.5;
  float jz = sin(uTime * 0.38 + aSeed * 11.0) * 0.5;
  vec3 jitterPos = position + vec3(jx, jy, jz) * instanceMatrix[3].xyz * 0.003;
  
  // Tamaño: bridge users 5.0, normales 3.5
  float sz = aIsBridge > 0.5 ? uBridgeSize : uBaseSize;
  // Factor densidad: partículas más grandes en zonas densas
  sz *= mix(1.0, 1.35, aDensity);
  gl_PointSize = sz * (300.0 / length(mvPos.xyz));
}
```

**GLSL Fragment Shader** (líneas 1220-1270):
```glsl
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  if (d > 0.5) discard;  // Circular clipping

  // Gradiente radial (glow)
  float alpha = smoothstep(0.5, 0.0, d);
  
  // Color base: verde #00ff9f para normales
  // Transición a dorado #ffbd00 para bridges
  vec3 col = mix(uBaseColor, uBridgeColor, vIsBridge);
  
  // Blend con color de lente
  col = mix(col, vLensColor, uLensBlend * step(0.01, length(vLensColor)));
  
  // Parpadeo temporal
  float twinkle = 0.8 + 0.2 * sin(uTime * mix(1.5, 3.0, vSeed) + vSeed * 20.0);
  
  gl_FragColor = vec4(col * twinkle * vBrightness, alpha * vVisible);
}
```

**Colores por tipo**:
- Normal: `#00ff9f` (verde)
- Bridge: `#ffbd00` (dorado)
- Multi-org users: ciclan colores de las orgs a las que pertenecen

### 4.4 Conexiones repo↔user — `QuantumBonds` (líneas 1642-1990)

**Geometría**: Doble hélice ADN con partículas GPU. MAX_BONDS = 5000.

Para cada par (repo, user) conectado:
- Se genera una **curva CatmullRom** entre las posiciones
- Se muestrean puntos a lo largo de la curva
- Se aplica un desplazamiento sinusoidal perpendicular para crear la hélice:

$$\text{offset}(t) = \sin(t \times 2\pi \times \text{helixFreq}) \times \text{helixRadius}$$
$$\text{offset2}(t) = \sin(t \times 2\pi \times \text{helixFreq} + \pi) \times \text{helixRadius}$$

Los dos strands usan colores distintos: verde `#00ff9f` y cian `#00f7ff`.

### 4.5 Conexiones org↔repo — `EntanglementChannels` (líneas 1996-2170)

**Geometría**: Líneas onduladas de 35 puntos (sinusoidal) entre org y repo.

- **InstancedMesh** con cilindros delgados colocados a lo largo de la curva
- Repos con estrellas tienen intensidad 1.0; sin estrellas, 0.3
- GLSL shader con onda de energía viajera y pulsación temporal

### 4.6 Arcos inter-org (Entanglement Arcs)

Los arcos de entrelazamiento son curvas CatmullRom entre orgs que comparten contributors:
- Se eleva el punto medio (bezier controlado) para crear arcos visibles
- El grosor/intensidad es proporcional al `strength` de la conexión
- Color: gradiente cyan ↔ verde ↔ violeta animado

### 4.7 Tunnel Beam — `QuantumTunnelBeam` (líneas 4700-4910)

Visualización del pathfinding (tunneling):
- **TubeGeometry** CatmullRom con draw-on animation (progresivo de 0 a 1 en 1.6s)
- Tubo principal (radio 0.4) + glow exterior (radio 1.2) con blending aditivo
- **GLSL triGradient**: 3 colores (cyan, verde, violeta) separados 120° con onda viajera
- **Halos** en nodos intermedios: `RingGeometry(1.5, 3.5)` con color cycling (cyan↔verde↔violeta)

---

## 5. Interacciones

### 5.1 Selección de entidades (click)

Al hacer click en una entidad (org, repo, user):
1. Se calcula el conjunto de IDs relacionados con `computeRelatedIds()` (líneas 490-510)
2. Se activa un **fly-to** con la cámara (`CameraRig`, líneas 3977-4108)
3. Se abre el panel de detalle con data progresiva (3 fases del worker)
4. Se añade a la pila de navegación (`navStack`)

**Offsets de cámara por tipo**:
| Tipo | Offset (x, y, z) |
|------|------------------|
| User | (4, 2.5, 4) |
| Repo | (10, 6, 10) |
| Org | (18, 10, 18) |

**Damping exponencial** de la cámara:
$$\text{pos}_{new} = \text{pos}_{old} + (\text{target} - \text{pos}_{old}) \times (1 - e^{-4.5 \cdot \Delta t})$$

### 5.2 Hover y tooltips

- `FloatingLabel` (líneas 4435-4490): tooltip HTML posicionado en 3D con offset Y variable (org=7, repo=3.5, user=2)
- Estilo quantum: fondo semi-transparente negro con bordes coloreados por tipo

### 5.3 Labels de viewport

- `ViewportLabels` (líneas 4110-4250): máximo 8 etiquetas de entidades relacionadas cuando hay selección
  - Throttle 250ms
  - Anti-overlap: `MIN_SCREEN_DIST = 70px`
  - Prioridad: orgs → repos → users, luego por distancia
- `TourViewportLabels` (líneas 4260-4430): modo tour con quota (4 orgs, 3 repos, 3 users)

### 5.4 Highlight de selección

`FocusHighlight` (líneas 4495-4540): tres torus rotantes + punto central con pulsación sinusoidal.

### 5.5 Navegación con historial

- Stack de navegación: permite volver a entidades previamente visitadas con botón "back"
- Breadcrumb visual en el panel de detalle

### 5.6 Pin & Compare

- Se pueden "pinear" entidades para comparar side-by-side
- Una barra inferior muestra las entidades pinadas con mini-radares
- Botón de expand/compact para el panel de detalle

---

## 6. Efectos visuales

### 6.1 Vacuum cuántico — `QuantumVacuum` (líneas 514-620)

**Propósito**: Fondo del universo — lattice + partículas

- **Grid XZ**: 400×400 (step=30), líneas con opacidad 0.023
- **400 GPU particles**: jitter en Y con shader vertex, verde `#3a6` ultrabrillante (×5), additive blending

### 6.2 Nubes de probabilidad — `ProbabilityClouds` (líneas 804-900)

**Propósito**: Orbitales gaussianas alrededor de cada qubit (repo)

- 10 partículas por qubit en coordenadas esféricas
- Shader: radio pulsante + theta/phi variantes, color violeta `#bd00ff`

### 6.3 Energy Rings — `EnergyRings` (líneas 2173-2240)

- `InstancedMesh` de rings (`RingGeometry(5.5, 6)`) alrededor de cada org
- Color: `#00f7ff` cyan, pulsación temporal

### 6.4 Campo de interferencia — `InterferenceField` (líneas 2280-2380)

- 600 partículas GPU a z=-200, formando un plano de fondo
- Color: azul `#2244ff`, opacidad 0.06
- Distribución 300×4 (x uniforme, y aleatorio)

### 6.5 Quantum Genesis (Big Bang) — `QuantumGenesis` (líneas 2400-2600)

**Componentes**:
1. **Flash central**: esfera blanca-cian (R=22), inner glow cian (R=8)
2. **3 shockwaves** escalonadas:
   - Icosaedro R=500 (delay 0.3s)
   - Octaedro R=350 (delay 0.9s)
   - Esfera R=250 (delay 1.6s)
3. **200 burst particles**: velocidades radiales 30-120, drag decay exponencial

**Trigger**: Controlado por `BuildDirector` al inicio de la escena.

### 6.6 Tunneling Pulses — `TunnelingPulses` (líneas 2620-2770)

- 25 fotones esféricos (R=0.18) viajando a lo largo de conexiones
- Onda sinusoidal perpendicular a la trayectoria
- Velocidad: 0.15-0.27, delay inicial: 7s
- Color: blanco×4, additive blending

### 6.7 Decoherence Waves — `DecoherenceWaves` (líneas 2780-2900)

- 3 ondas de anillo expandiéndose desde orgs aleatorias
- `RingGeometry(0.9, 1)`, escala hasta 90
- Duración: 3.5s, spawn cada 8-14s
- Color: cian `#00f7ff` con fade-out

### 6.8 Cosmic Rays — `CosmicRays` (líneas 2910-3100)

**8 rayos cósmicos** con trails de ribbón (48 puntos cada uno):

- **55% escape rays**: velocidad 1000-1500, impactan Dyson Shell a R=3500 → generan `shellImpacts`
- **45% normal rays**: velocidad 200-480, cruzan el interior
- **6 colores**: cian, magenta, dorado, esmeralda, naranja, violeta
- **Trail ribbon**: geometría `BufferGeometry` con vertices para ancho perpendicular a la dirección

### 6.9 Dyson Shell — `ElectronOrbits` (líneas 3120-3400)

**Geodésica icosaédrica** — esfera geodésica construida a mano:

1. **Icosaedro base**: 12 vértices, 20 caras triangulares
2. **4 iteraciones de subdivisión**: cada triángulo → 4 triángulos (~1280 triángulos finales, ~2560 aristas, ~1280 nodos)
3. **Normalización**: todos los vértices proyectados a radio 3500

**GLSL Edge Shader**:
```glsl
// 12 pulsos de energía viajando por las aristas
uniform vec3 uPulsePositions[12];
// Impactos de rayos cósmicos con onda gaussiana
float shockwave con σ² = 400², centro σ² = 500²
RIPPLE_SPEED = 1500, duración = 2.5s
```

**GLSL Node Shader**:
- Glow radial con `smoothstep`
- Color base azul + impacto coloreado por el color del rayo

**12 energy pulses**: viajan por el grafo de adyacencia de las aristas. Al llegar a un nodo, eligen una arista aleatoria adyacente.

**Impact system**: Cuando un cosmic ray impacta la shell:
1. Se registra la posición e instante
2. Se propaga una **shockwave gaussiana**:
$$\text{intensity} = e^{-d^2 / (2\sigma^2)} \times (1 - t/\text{duration})$$
3. La onda se expande radialmente a 1500 unidades/s
4. Duración del impacto: 2.5s

### 6.10 Quantum Foam — `QuantumFoam` (líneas 3400-3520)

- 200 partículas virtuales con ciclo creación/aniquilación
- Jitter de Heisenberg: ±2.5 en cada eje
- Colores: blanco → cian
- Delay inicial: 2.5s
- Lifecycle: spawn con velocidad, drift, fade to zero, respawn

### 6.11 Interference Grid — `InterferenceGrid` (líneas 3535-3720)

**Grid de interferencia de ondas** en el plano XZ:

- **Tamaño**: 70×70 = 4900 puntos, extent=2000, Y=-50
- **5 fuentes de onda**: 4 periféricas + 1 central de alta frecuencia
- **Desplazamiento vertical**:
$$Y(x,z) = \sum_{i=1}^{5} A_i \times \sin(k_i \times d_i - \omega_i \times t)$$

  Donde $d_i = ||\text{point} - \text{source}_i||$ y $A_i = 35 \times \text{centerBoost}$

- **3 colores por signo de onda**: verde (+), violeta (−), cian (≈0)
- **Fuentes en drift lento** para patrones nunca repetitivos

### 6.12 Gravitational Waves — `GravitationalWaves` (líneas 3730-3880)

- **4 ondas** expandiéndose desde las top 8 orgs (selección aleatoria)
- **Ring geometry**: 96 segmentos con vértices inner/outer (ancho de anillo)
- Velocidad: 28-43, radio máximo: 90-150
- Duración: 4-7s
- Color: azul `#4488ff`
- Fade-in/fade-out suave

### 6.13 Hawking Radiation — `HawkingRadiation` (líneas 3890-3970)

- **18 partículas por org** emitidas radialmente hacia afuera
- GPU shader con coordenadas esféricas (theta, phi aleatorios por semilla)
- Color: `#00f7ff` ×2
- Visibilidad temporal sincronizada con filtro de año

### 6.14 Bloch Axes — `BlochAxes` (líneas 1047-1135)

- Ejes |0⟩↔|1⟩ por cada qubit (repo)
- Líneas verticales con labels en los extremos

### 6.15 simpleMode

Cuando `simpleMode = true`, se desactivan todos los efectos ambientales pesados: CosmicRays, DysonShell, GravitationalWaves, QuantumFoam, InterferenceGrid, HawkingRadiation. Solo permanecen los efectos estructurales (bonds, channels, rings).

---

## 7. Flujo de datos

### 7.1 Pipeline completo

```
┌─────────────────────────────────────────────────────────────┐
│ Backend API (GitHub data + enrichment)                       │
│  → dashboardStore.collaborationDiscovery                     │
│    { organizations[], repositories[], users[],               │
│      connections[], enrichedData }                            │
└──────────────────────────┬──────────────────────────────────┘
                           │
                  ┌────────▼────────┐
                  │ useEnrichedData  │ ← Merge graph + charts
                  │ (142 lines)      │   Adds: bio, stars,
                  └────────┬────────┘   quantum_repos, etc.
                           │
              ┌────────────▼────────────────┐
              │ Bot filter + temporal filter  │
              │ (UniverseView main body)      │
              └────────────┬────────────────┘
                           │
              ┌────────────▼────────────────┐
              │ Web Worker:                   │
              │ computeLayout.worker.js       │
              │ (5 phases, off main thread)   │
              └────────────┬────────────────┘
                           │ postMessage
              ┌────────────▼────────────────┐
              │ processLayoutResultAsync      │
              │ (chunked Vector3 conversion)  │
              │ 500 pos/yield, 1000 conn/yield│
              └────────────┬────────────────┘
                           │
              ┌────────────▼────────────────┐
              │ universeData (local state)    │
              │ → QuantumScene                │
              │ → all sub-components          │
              └─────────────────────────────┘

User Click → ┌──────────────────────────────┐
             │ Web Worker:                    │
             │ computeDetailData.worker.js    │
             │ Phase 1: radar+health (<50ms)  │
             │ Phase 2: impact+matrix (med)   │
             │ Phase 3: similar (heavy, O(N)) │
             └──────────────────────────────┘
```

### 7.2 useEnrichedData (142 líneas)

Fusiona dos fuentes:
- `data` (del store): datos graph ligeros para 3D (ids, posiciones, conexiones)
- `charts` (del backend): datos enriquecidos (contributions_to_quantum, top_quantum_languages, bio, company, followers_count, quantum_repos_count, top_languages, total_stars, etc.)

El merge se hace por ID. Los campos enriquecidos solo se añaden cuando están disponibles; los datos graph siempre están presentes.

### 7.3 Carga progresiva del panel de detalle

El `computeDetailData.worker.js` envía 3 mensajes progresivos:

| Phase | Contenido | Latencia típica |
|-------|-----------|-----------------|
| 1 | Radar axes, health score, zone, network role, DNA, analysis text, basic stats | <50ms |
| 2 | Impact simulations, collaboration matrix heatmap | ~100-300ms |
| 3 | Similar entities (búsqueda exhaustiva O(N)) | ~200-2000ms |

---

## 8. Configuración y constantes

### 8.1 Layout constants (computeLayout.worker.js)

| Constante | Valor | Descripción |
|-----------|-------|-------------|
| `PERIPHERY_MAX` | 900 × scaleFactor | Radio máximo del universo |
| `MIN_SEP` | 55 × scaleFactor | Separación mínima entre orgs |
| `REPO_MIN_ORBIT` | 18 | Radio mínimo de órbita repo |
| `REPO_MAX_ORBIT` | 55 × scaleFactor | Radio máximo de órbita repo |
| `USER_MIN_ORBIT` | 4 | Radio mínimo offset user |
| `USER_MAX_ORBIT` | 10 | Radio máximo offset user |
| `scaleFactor` | 1.0-1.3 | Según nº orgs: >100→1.3, >60→1.15, >30→1.05 |

### 8.2 Animation timing — BuildDirector (líneas 4545-4580)

| Fase | Start (s) | Duration (s) | Descripción |
|------|-----------|-------------|-------------|
| genesis | 0.0 | 2.0 | Big Bang flash + shockwaves |
| vacuum | 2.5 | 2.0 | Grid + background particles |
| processors | 2.8 | 1.8 | Organizaciones aparecen |
| qubits | 4.0 | 2.0 | Repositorios aparecen |
| particles | 5.5 | 1.5 | Usuarios aparecen |
| entanglement | 6.5 | 1.8 | Conexiones se dibujan |

Easing: `easeOutCubic(t) = 1 - (1-t)³`

### 8.3 Progressive mounting — MOUNT_STAGES

| Stage | Delay (ms) | Componentes |
|-------|-----------|-------------|
| 1 | ~200 | QuantumProcessors (orgs) |
| 2 | ~250 | EnergyRings |
| 3 | ~350 | Qubits (repos) |
| 4 | ~400 | QuantumParticles (users) |
| 5 | ~500 | QuantumBonds (DNA helices) |
| 6 | ~600 | EntanglementChannels |
| 7 | ~700 | Arcs + Clouds + Axes |
| 8 | ~800 | Ambient effects |
| 9 | ~900 | Spectacular (DysonShell, CosmicRays, etc.) |

`SCENE_READY_STAGE = 5` — El loader empieza a desvanecerse tras montar users.

### 8.4 LOD system — useLOD (línea ~4570)

| Distancia cámara | Nivel | Visible |
|------------------|-------|---------|
| >400 | far | Orgs + repos only |
| 120-400 | mid | + bridges + bonds |
| <120 | near | Todo (particles, effects, labels) |

### 8.5 Colores del sistema

| Entidad/Efecto | Color hex | Uso |
|----------------|-----------|-----|
| Organizaciones | `#00f7ff` | Torus + channels + rings |
| Repositorios | `#bd00ff` | Esferas + probability clouds |
| Users normales | `#00ff9f` | Partículas verdes |
| Users puente | `#ffbd00` | Partículas doradas |
| Zona Core | `#00ff9f` | Wireframe esfera |
| Zona Intermedia | `#4488ff` | Wireframe esfera |
| Zona Periférica | `#aa44ff` | Wireframe esfera |
| Fondo canvas | `#020208` | clearColor |

### 8.6 Cámara

| Propiedad | Valor |
|-----------|-------|
| FOV | 60° |
| near | 0.1 |
| far | 8000 |
| DPR | [1, 1.5] |
| powerPreference | 'high-performance' |

### 8.7 Bloom postprocessing

| Propiedad | Valor |
|-----------|-------|
| intensity | 1.4 |
| luminanceThreshold | 0.2 |
| luminanceSmoothing | 0.9 |
| radius | 0.85 |

---

## 9. Gestión de estado

### 9.1 Zustand — dashboardStore (1173 líneas)

Campos principales relacionados con Universe:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `collaborationDiscovery` | Object | Datos crudos del backend (orgs, repos, users, connections) |
| `showCollaborationGraph` | boolean | Toggle de visualización del universo |
| `temporalFilter` | `{yearFrom, yearTo}` | Filtro temporal global |
| `sliderYear` | number | Año del slider temporal |
| `activeNodeIds` | Set\<string\> | IDs de nodos activos tras filtro temporal |
| `activeLens` | string\|null | Lente activa: 'communities'\|'centrality'\|'busFactor'\|'intensity'\|'disciplines'\|null |
| `networkMetrics` | Object | Métricas de red del backend (centralidad, comunidades, bus factor) |
| `tunnelingPath` | Object | Resultado del pathfinding (BFS) |
| `autoStartTour` | boolean | Auto-iniciar tour cinematográfico |

**Acciones principales**:
- `discoverCollaboration()` — Fetch del backend y carga de datos
- `openCollaborationGraph()` / `closeCollaborationGraph()` — Toggle vista
- `applyTemporalFilter()` — Calcula `computeTemporalVisibility` (Map<nodeId, 0-1>)
- `setSliderYear()` — Actualiza año del slider
- `loadNetworkMetrics()` — Carga métricas de red
- `setActiveLens()` — Cambia la lente activa
- `setTunnelingPath()` — Resultado de pathfinding

### 9.2 Estado local en UniverseView

| Variable | Tipo | Descripción |
|----------|------|-------------|
| `universeData` | useState | Resultado procesado del layout worker |
| `selectedEntity` | useState | Entidad seleccionada (click) |
| `hoveredEntity` | useState | Entidad bajo hover |
| `detailData` | useState | Datos del detail worker (fase 1-3) |
| `navStack` | useRef | Pila de navegación de entidades |
| `mountStage` | useRef | Etapa actual de montaje progresivo |
| `buildPhases` | useRef | Progreso de animación por fase (BuildDirector) |
| `cameraTarget` | useRef | Posición objetivo de la cámara |
| `localSlider` | useState | Valor inmediato del slider temporal |
| `searchTerm` | useState | Término de búsqueda |
| `showPanel` | boolean | Panel de detalle abierto |
| `showHelp` | boolean | Panel de ayuda abierto |
| `tourWaypoints` | useState | Waypoints del tour cinematográfico |
| `tourIndex` | useState | Índice actual en el tour |

### 9.3 Otros stores

- `favoritesStore` — Entidades marcadas como favoritas (persistente)
- `devStore` — Flags de desarrollo (debug overlays)

---

## 10. Filtrado y búsqueda

### 10.1 Search (autocomplete)

- **Debounce**: 120ms
- **Búsqueda**: nombre/login/full_name de orgs, repos, users
- **Agrupación**: Organizaciones → Repositorios → Usuarios
- **Límite**: 50 resultados máximo
- **Tags**: Badge "bridge" para usuarios puente
- **Al seleccionar**: fly-to de cámara + abrir panel de detalle

### 10.2 Sistema de Lentes (5 lentes)

| Lente | id | Efecto visual |
|-------|----|---------------|
| Communities | `communities` | Color por comunidad detectada. Orgs multi-org hacen transición entre colores de sus comunidades |
| Centrality | `centrality` | Gradiente rojo→amarillo→verde según percentil de centralidad |
| Bus Factor | `busFactor` | Rojo (1 mantainer) → verde (>=5) — resilencia |
| Intensity | `intensity` | Brillo proporcional a actividad reciente |
| Disciplines | `disciplines` | 6 colores por disciplina, con sub-filtro popup |

**Disciplinas** (con colores):
1. `quantum_software` — Software cuántico
2. `quantum_physics` — Física cuántica
3. `quantum_hardware` — Hardware cuántico
4. `classical_tooling` — Herramientas clásicas
5. `education_research` — Educación e investigación
6. `multidisciplinary` — Multidisciplinario (transición entre colores)

**Transición de lente**: Al cambiar de lente, se muestra un overlay de transición con un spinner atómico y el color de la nueva lente. Los colores interpolan suavemente (LERP) en los shaders.

### 10.3 Filtro temporal

- **Slider**: rango [min, max] del dataset (años de pushed_at)
- **Inputs numéricos**: yearFrom / yearTo
- **Visibilidad temporal**: `computeTemporalVisibility()` genera un `Map<nodeId, number>` donde:
  - 1.0 = plenamente visible (dentro del rango)
  - 0.0 = invisible (fuera del rango)
  - Los valores intermedios se lerp-ean a 0.015/frame para transiciones suaves

### 10.4 Filtro por tipo de entidad

Checkboxes en el menú de settings para mostrar/ocultar:
- Organizaciones
- Repositorios
- Usuarios normales
- Usuarios puente
- Colaboraciones (arcos)

### 10.5 Filtro de favoritos

Toggle que muestra solo las entidades marcadas como favoritas (persistido en `favoritesStore`).

### 10.6 Filtro de bots

Toggle que excluye usuarios identificados como bots del layout.

### 10.7 Quantum Tunneling — Pathfinding

**Panel de tunneling** con dos inputs autocomplete (source/target).

Al seleccionar ambos:
1. Se ejecuta **BFS** sobre el grafo de conexiones
2. Se resuelve el camino más corto (por nodos intermedios)
3. El resultado se visualiza con `QuantumTunnelBeam` (tubo CatmullRom + draw-on)
4. La cámara hace auto-focus al **bounding box** del path con padding
5. Se muestra una **timeline** con tarjetas para cada paso del camino

---

## Apéndice A: Tour Cinematográfico

### Generación de waypoints — `generateTourWaypoints()` (líneas 5138-5440)

El tour genera **12-16 waypoints narrativos** dinámicamente a partir de los datos reales:

| # | Waypoint | Año | Duración | Descripción |
|---|----------|-----|----------|-------------|
| 0 | El Vacío | min-1 | 18s | Oscuridad total. Contexto histórico: Feynman, Shor, Grover |
| 1 | Preludio | min-1 | 12s | "La industria abrió sus puertas…" + trigger Big Bang a 9s |
| 2 | Génesis | first+0.5 | 16s | Cámara cenital. Cuenta total: repos, orgs, users |
| 3 | Primeros Nodos | first+0.5 | 12s | Zoom a primera org/repo. Nombres reales |
| 3b | Primer Gigante | keyOrg.year | 13s | IBM/Google/Microsoft — primer actor industrial |
| - | Aceleración 2019 | 2019.5 | 14s | Solo si hay datos en 2019. Growth + nuevas orgs |
| - | Competencia 2020-21 | 2020.5 | 13s | Post-supremacía, startups, estándares |
| 4 | Epicentro | - | 13s | Org más central por score |
| 5 | Qubit Estelar | - | 12s | Repo con más estrellas + top 3 |
| 6 | Entrelazamiento | mid+1 | 13s | Vista panorámica de arcos inter-org (excl. siblings) |
| 7 | Usuarios Puente | mid+2 | 13s | % bridges, top 3, impacto |
| 8 | Inflación Cósmica | peakYear | 13s | Año de mayor crecimiento |
| 9 | Babel Cuántica | max-1 | 12s | Diversidad de lenguajes |
| - | Consolidación | 2022.5 | 13s | Solo si hay datos 2022+. Madurez |
| 10 | Panorámica Final | max | 14s | Vista cenital. Resumen numérico total |

**Detección de orgs industriales**: 7 patterns regex (IBM/Qiskit, Google/Cirq, Microsoft/Q#, Rigetti, D-Wave, Xanadu, Zapata).

**Sibling org detection** (`areSiblingOrgs`, líneas 4920-4945): Dos prongs para detectar orgs que son realmente la misma entidad (e.g., "qiskit" y "qiskit-community"):
1. **Token-based**: primer token compartido (≥4 chars) si uno es single-token
2. **Prefix-based**: normalizado sin separadores, el menor es prefijo del mayor con ratio ≤3

### Fases del tour overlay

1. **Void**: Pantalla negra con texto centrado
2. **Preludio**: Texto dramático, trigger Big Bang a `triggerBigBangAt` segundos
3. **Genesis**: Post-Big Bang, glow central
4. **Normal**: Título + texto narrativo + labels de entidades + controles prev/next

---

## Apéndice B: Panel de Detalle (computeDetailData.worker.js)

### Radar de 5 ejes (100% data-driven)

Cada eje es el **percentile rank** de la entidad en la distribución de su tipo, usando binary search con mid-rank CDF.

**Orgs**: Centralidad, Conectividad, Diversidad (cross-pollination), Puente (bridge %), Influencia (users × repos)

**Repos**: Centralidad, Conectividad, Diversidad (org diversity), Puente (bridge ratio), Alcance (user count)

**Users**: Centralidad, Conectividad, Org Span, Colaboración (co-contributor exposure), Versatilidad (language count)

### Health Score (solo orgs)

Media aritmética de 5 percentiles:
1. **Diversidad**: cross-pollination percentil
2. **Resiliencia**: bus factor promedio percentil
3. **Red Bridge**: bridge user % percentil
4. **Tech Stack**: language variety percentil
5. **Distribución**: uniformidad de contributors (coef. variación invertido) percentil

### Impact Simulation

Para los top 3 key dependencies (usuarios más críticos), simula:
- Repos afectados si el usuario se va
- Conexiones de org perdidas (donde era unique connector)
- Delta de health score
- Severidad: critical / high / moderate

### Collaboration Matrix

Heatmap de contributors compartidos entre repos de una org (máx. 8 repos, top sorted).

### Similar Entities

Distancia euclídea en el espacio 5D del radar percentil. Similarity = $\max(0, \lceil (1 - \frac{d}{\sqrt{5}}) \times 100 \rceil)$. Top 5 más similares.

---

## Apéndice C: Patrones de rendimiento

| Patrón | Implementación |
|--------|---------------|
| **Web Workers** | Layout y detail data calculados off main-thread |
| **GPU Shaders** | TODAS las partículas son GLSL (0% CPU por frame) |
| **InstancedMesh** | Orgs, repos, users, bonds, rings — un draw call cada uno |
| **Progressive mounting** | 9 stages con delays escalonados (200-900ms) |
| **Ref-based animation** | `useRef` para progreso de animación → cero re-renders React |
| **Chunked async** | processLayoutResultAsync: 500 pos/yield, 1000 conn/yield |
| **LOD** | 3 niveles por distancia de cámara |
| **Throttled labels** | 250ms (normal), 350ms (tour) |
| **Debounced search** | 120ms |
| **simpleMode** | Desactiva 6 efectos ambientales pesados |
| **Temporal lerp** | Visibilidad interpolada a 0.015/frame (no step functions) |
| **Additive blending** | Todas las partículas usan THREE.AdditiveBlending (sin depth write) |
| **Frustum culling disabled** | Efectos ambientales marcan `frustumCulled={false}` para estabilidad |
| **Conditional frameloop** | `frameloop` = 'always' durante animaciones, 'demand' en reposo |
