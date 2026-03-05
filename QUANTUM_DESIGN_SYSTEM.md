# 🔬 ENTANGLE — Sistema de Diseño Cuántico

> Documentación completa de todos los elementos visuales inspirados en mecánica cuántica implementados en el dashboard ENTANGLE.  
> Para uso en la memoria del TFG — UCLM.

---

## Índice

1. [Visión General](#1-visión-general)
2. [Componentes React Dedicados](#2-componentes-react-dedicados)
3. [Pantalla de Carga](#3-pantalla-de-carga)
4. [Header y Branding](#4-header-y-branding)
5. [Tarjetas KPI](#5-tarjetas-kpi)
6. [Gráficos Interactivos](#6-gráficos-interactivos)
7. [Grafo de Red (NetworkGraph)](#7-grafo-de-red-networkgraph)
8. [Tablas de Detalle](#8-tablas-de-detalle)
9. [Navegación](#9-navegación)
10. [Footer](#10-footer)
11. [Elementos Globales](#11-elementos-globales)
12. [Estados del Sistema](#12-estados-del-sistema)
13. [Resumen Técnico](#13-resumen-técnico)

---

## 1. Visión General

El frontend de ENTANGLE incorpora un **sistema de diseño cohesivo inspirado en mecánica cuántica**, donde cada elemento visual tiene un análogo en la física cuántica real. Esta decisión de diseño refuerza la identidad del proyecto (análisis de ecosistemas de software cuántico) y crea una experiencia inmersiva y diferenciadora.

### Principios de diseño

- **Coherencia temática**: cada decoración tiene un fundamento en mecánica cuántica real.
- **Sutileza ante todo**: los efectos son decorativos y nunca interfieren con la legibilidad de los datos.
- **Rendimiento**: se priorizan animaciones CSS sobre JavaScript; las animaciones Canvas usan `requestAnimationFrame` con cleanup adecuado.
- **Paleta cromática**: cian (`#00D4E4`), púrpura (`#9D6FDB`), verde neón (`#00FF9F`) sobre fondo oscuro (`#0F1419`).

---

## 2. Componentes React Dedicados

### 2.1 QuantumBackground — Fondo de partículas entrelazadas

| | |
|---|---|
| **Archivo** | `src/components/QuantumBackground.jsx` |
| **Tecnología** | Canvas API + `requestAnimationFrame` |
| **Concepto físico** | Entrelazamiento cuántico (quantum entanglement) |

**Descripción:** Canvas a pantalla completa con ~60 partículas (cian, púrpura, verde) que se mueven libremente y rebotan en los bordes de la ventana. Cada partícula tiene un radio que pulsa siguiendo una función sinusoidal, simulando la naturaleza ondulatoria de las partículas cuánticas.

**Comportamiento:**
- Cuando dos partículas están a menos de 140px de distancia, se dibujan líneas de conexión con gradiente, representando la proximidad en el espacio de Hilbert.
- Cada ~4 segundos se generan **"entanglement flashes"**: curvas Bézier brillantes entre pares de partículas distantes, representando el entrelazamiento no-local (correlación instantánea independiente de la distancia).

**Analogía cuántica:** Representa un sistema de muchas partículas donde las correlaciones cuánticas (entanglement) conectan partículas sin importar la distancia, un fenómeno central de la mecánica cuántica que Einstein llamó "spooky action at a distance".

---

### 2.2 QuantumDivider — Separador de función de onda

| | |
|---|---|
| **Archivos** | `src/components/QuantumDivider.jsx`, `QuantumDivider.module.css` |
| **Tecnología** | SVG + CSS Animations |
| **Concepto físico** | Función de onda ψ(x), interferencia cuántica |

**Descripción:** Separador visual SVG que reemplaza las líneas horizontales convencionales con funciones de onda animadas. Genera dos paths sinusoidales:
- **ψ(x)**: onda principal con amplitud 8px y frecuencia base.
- **φ(x)**: onda secundaria de interferencia, desfasada, con menor amplitud.

Ambas ondas tienen gradiente lineal cian→púrpura→cian y animación `stroke-dashoffset` que las hace "fluir" horizontalmente.

**Nodos cuánticos:** 7 círculos posicionados a intervalos regulares sobre la onda representan nodos de probabilidad (puntos donde |ψ|² = 0). Cada nodo tiene animación `nodeCollapse` que pulsa su radio de 1.5px a 3px, simulando la fluctuación cuántica.

**Variante `large`:** Duplica la amplitud para secciones principales.

**Analogía cuántica:** Visualiza la función de onda de una partícula en un pozo de potencial, con los nodos representando los ceros de la distribución de probabilidad.

---

### 2.3 BlochSphere — Esfera de Bloch

| | |
|---|---|
| **Archivos** | `src/components/BlochSphere.jsx`, `BlochSphere.module.css` |
| **Tecnología** | SVG + CSS Animations |
| **Concepto físico** | Representación geométrica de un qubit (esfera de Bloch) |

**Descripción:** Representación visual de la esfera de Bloch, la herramienta estándar en computación cuántica para visualizar el estado de un qubit.

**Elementos:**
- **Esfera**: círculo con gradiente cian→púrpura y opacidad reducida.
- **Ecuador**: elipse con línea discontinua que gira continuamente (animación `equatorSpin`, 20s), representando las rotaciones en el plano XY.
- **Eje Z**: línea vertical discontinua con etiquetas `|0⟩` (polo norte, cian) y `|1⟩` (polo sur, púrpura) — los estados base computacionales.
- **Vector de estado |ψ⟩**: línea desde el centro hacia un punto en la superficie, con un punto terminal pulsante (`pointGlow`), representando el estado cuántico actual.

**Uso:** Dos instancias flanquean la ecuación de Schrödinger en la sección hero del dashboard.

**Analogía cuántica:** La esfera de Bloch mapea el estado general de un qubit |ψ⟩ = α|0⟩ + β|1⟩ a un punto en la superficie de una esfera unitaria, donde las coordenadas esféricas (θ, φ) determinan las amplitudes de probabilidad α y β.

---

### 2.4 WavefunctionCollapse — Colapso de función de onda interactivo

| | |
|---|---|
| **Archivos** | `src/components/WavefunctionCollapse.jsx`, `WavefunctionCollapse.module.css` |
| **Tecnología** | SVG + CSS Transitions (controlado por React state) |
| **Concepto físico** | Colapso de la función de onda (postulado de medición) |

**Descripción:** Componente SVG interactivo que simula el colapso de la función de onda al realizar una medición cuántica. Consta de dos estados visuales:

**Estado superpuesto (default):**
- Path sinusoidal con envolvente gaussiana: `envelope(t) = e^{-((t-0.5)·4)²}`, modulado por `sin(6πt)`.
- Representa la distribución de probabilidad |ψ(x)|² antes de la medición — la partícula está en superposición de posiciones.
- Gradiente cian→púrpura con filtro de glow.
- Etiqueta: `|ψ|²` (densidad de probabilidad).

**Estado colapsado (hover):**
- Delta de Dirac: `δ(t) = e^{-((t-0.5)·20)²}` — pico extremadamente estrecho centrado.
- Representa el estado tras la medición: la partícula tiene una posición definida.
- Punto de medición brillante (círculo cian con glow) que aparece en el pico.
- Etiqueta: `δ(x)` (distribución delta de Dirac).

**Transición:** Controlada por prop `collapsed` (boolean) que viene del estado `hoveredCard` del componente padre. La onda se desvanece y la delta aparece con `transition: opacity 0.4s ease`, creando la ilusión de colapso instantáneo.

**Padding SVG:** El viewBox incluye 8px de padding superior para que el punto de medición y su glow no se corten por el `overflow: hidden` de las tarjetas.

**Analogía cuántica:** Implementa visualmente el postulado de medición de la mecánica cuántica: antes de medir, un sistema existe en superposición de estados (onda distribuida); al medir, "colapsa" a un único estado definido (delta de Dirac).

---

## 3. Pantalla de Carga

| | |
|---|---|
| **Archivos** | `src/App.jsx`, `src/App.module.css` |
| **Ubicación** | Pantalla completa al iniciar la aplicación |

### 3.1 Spinner atómico orbital

**Tecnología:** SVG con `<animateMotion>`

Reemplaza el spinner circular convencional con un modelo atómico animado:
- **3 órbitas elípticas** a 0°, 60° y 120° (cian, púrpura, verde) — representan los orbitales atómicos.
- **3 electrones** (círculos con glow) que viajan por las órbitas a diferentes velocidades (2s, 2.6s, 3.2s) usando `<animateMotion>`.
- **Núcleo central** con animación `coreBreathe` (radio y opacidad pulsantes).

### 3.2 Frases cuánticas rotativas

Array de 6 frases que rotan cada 2.2s con animación `phraseFade` (blur + translateY):

1. *"Inicializando qubits..."*
2. *"Entrelazando datos del ecosistema..."*
3. *"Aplicando puerta Hadamard..."*
4. *"Colapsando función de onda..."*
5. *"Midiendo estados cuánticos..."*
6. *"Decodificando superposición..."*

Cada frase describe un paso real en un algoritmo cuántico, mapeado metafóricamente al proceso de carga.

### 3.3 Scanlines CRT

**Tecnología:** CSS pseudo-elementos

Efecto de monitor CRT retro superpuesto en la pantalla de carga:
- `::before`: `repeating-linear-gradient` con líneas de 4px en cian ultra-tenue (0.015 opacity), con animación `scanlineScroll`.
- `::after`: barrido de luz (`scanSweep`, 4s) — gradiente vertical que recorre la pantalla, simulando el refresco de un tubo de rayos catódicos.

### 3.4 Logo con sombras dual cuánticas

El logo de carga tiene `drop-shadow` dual:
- Sombra púrpura a la izquierda (-30px)
- Sombra cian a la derecha (+30px)
- Animación `shadowMove` (4s) que oscila las posiciones.

### 3.5 Sistema de reintentos con indicador visual

Cuando el backend no responde, el sistema reintenta automáticamente con backoff incremental:
- **3 reintentos** con delays de 2s, 4s, 6s (backoff lineal).
- Las frases cuánticas siguen rotando durante los reintentos.
- Indicador secundario: *"Reintentando conexión... (1/3)"* en naranja con animación `retryPulse`.
- El indicador siempre ocupa espacio en el DOM (visibility toggle) para evitar saltos de layout.

---

## 4. Header y Branding

### 4.1 Efecto de superposición cuántica en "ENTANGLE"

| | |
|---|---|
| **Archivo** | `src/App.module.css` (`.logoAccent`) |
| **Concepto físico** | Superposición cuántica |

El título "ENTANGLE" utiliza un gradiente cian→púrpura como texto. Dos pseudo-elementos (`::before`, `::after`) crean copias "fantasma" del texto con `blur` y opacidad reducida que oscilan ±2px alrededor del original (animación `quantumShift`, 8s).

**Analogía cuántica:** Las copias borrosas representan los estados superpuestos del texto — como una partícula que existe simultáneamente en múltiples posiciones ligeramente diferentes, una manifestación visual del principio de incertidumbre de Heisenberg.

### 4.2 Puntos orbitales del subtítulo

Dos puntos de 4px flanquean "Quantum Software Ecosystem Analysis":
- **Izquierdo:** cian, con glow `box-shadow` cian.
- **Derecho:** púrpura, con glow `box-shadow` púrpura, desfase de animación 1.5s.
- Ambos con animación `orbitalPulse` (3s): escalan de 1x a 1.6x y varían opacidad.

Representan un par de partículas entrelazadas (EPR pair) pulsando en antifase.

### 4.3 Indicador de estado cuántico del backend

Badge en el header con notación de Dirac para el estado de conexión:

| Estado | Notación | Significado cuántico |
|--------|----------|---------------------|
| Online | `\|1⟩` | Estado excitado / qubit en 1 (operativo) |
| Offline | `\|0⟩` | Estado fundamental / qubit en 0 (inactivo) |
| Verificando | `α\|0⟩+β\|1⟩` | Superposición de estados (aún no medido) |

El estado "checking" incluye animación `superposition` que pulsa la opacidad, reforzando la idea de indeterminación.

### 4.4 Ecuación de Schrödinger

En la sección hero, centrada entre dos esferas de Bloch:

```
iℏ ∂|ψ⟩/∂t = Ĥ|ψ⟩
```

La ecuación de Schrödinger dependiente del tiempo — la ecuación fundamental que gobierna la evolución temporal de todo sistema cuántico. Renderizada en fuente monospace con color cian al 25% de opacidad.

---

## 5. Tarjetas KPI

### 5.1 WavefunctionCollapse en cada tarjeta

Cada una de las 3 tarjetas KPI (Repositorios, Usuarios, Organizaciones) incluye un `<WavefunctionCollapse>` posicionado en la esquina inferior derecha (ver sección 2.4).

**Interacción:** El estado de hover se controla desde `KPISection.jsx` mediante un estado `hoveredCard` compartido, que pasa el prop `collapsed` a cada instancia según qué tarjeta está bajo el cursor.

### 5.2 Notación `|ψ⟩` decorativa

Cada tarjeta muestra `|ψ⟩` en la esquina superior derecha (`::after` pseudo-element) con opacidad ultra-baja (0.08), que aumenta a 0.2 al hover.

**Analogía:** Cada KPI es un observable cuántico cuyo valor está en superposición hasta que el usuario "mide" (hace hover).

### 5.3 Badge `|FILTERED⟩`

Cuando hay filtros activos (organización, lenguaje o repositorio seleccionado), aparece un badge con el texto `|FILTERED⟩` con animación `badgePop` (scale bounce).

**Analogía:** El estado `|FILTERED⟩` es un eigenstate (estado propio) del operador de filtrado — el sistema ha colapsado al subconjunto seleccionado.

---

## 6. Gráficos Interactivos

### 6.1 Tooltips de medición cuántica

| | |
|---|---|
| **Archivo** | `src/components/Dashboard/ChartsSection.jsx` (CustomTooltip) |
| **Concepto físico** | Medición cuántica, notación bra-ket |

Los tooltips de Recharts se reemplazan por un diseño cuántico personalizado:
- **Icono de medición:** `⊕` (símbolo del operador de medición en la base computacional).
- **Valores en notación bra-ket:** `⟨nombre| = valor` — usa la notación bra `⟨ |` para representar el resultado de la medición.
- **Pie de tooltip:** *"medición colapsada"* en púrpura tenue — indica que al hacer hover se ha "medido" el observable.
- **Estilo:** borde izquierdo cian de 3px, fondo glass con `backdrop-filter: blur(10px)`, sombra con glow cian.

### 6.2 Operadores cuánticos decorativos

Cada tarjeta de gráfico muestra un operador cuántico en la esquina inferior derecha (pseudo-elemento `::after`):
- **Card 1:** `Ĥ` — Operador Hamiltoniano (energía del sistema).
- **Card 2:** `σ̂` — Operadores de Pauli (rotaciones de qubit).
- **Card 3:** `Û` — Operador unitario de evolución temporal.

Opacidad base 0.06, sube a 0.18 al hover.

---

## 7. Grafo de Red (NetworkGraph)

### 7.1 Núcleo atómico central

| | |
|---|---|
| **Archivo** | `src/components/Dashboard/NetworkGraph.jsx` |
| **Concepto físico** | Modelo atómico de Bohr |

En el centro del grafo circular de colaboraciones se renderiza un modelo atómico:
- **Halo exterior:** círculo pulsante (`haloPulse`, radio 45↔52px) en cian tenue.
- **3 órbitas elípticas** a 0°, 60° y 120° con animación `orbitSpin` a diferentes velocidades (12s, 16s, 20s).
- **3 electrones** viajando por las órbitas con `<animateMotion>` (cian, púrpura, verde).
- **Núcleo central** con `corePulse` (radio 5↔7px).

### 7.2 Pulsos de energía viajando por conexiones

Puntos de luz que viajan por las curvas Bézier entre nodos del grafo:
- **Oleada inicial:** 15+10 pulsos al aparecer el grafo (fade-in de 1.5s).
- **Pulsos ambientales:** cada 2-6s (intervalo aleatorio), nuevos pulsos viajan por conexiones aleatorias.
- Cada pulso usa `<animateMotion>` siguiendo el path de la curva, con glow SVG filter.
- Se ocultan cuando el usuario hace hover sobre un nodo (para no distraer de la información).

**Analogía:** Los pulsos representan la transferencia de información cuántica (quantum teleportation) entre los nodos del ecosistema.

---

## 8. Tablas de Detalle

### 8.1 Rankings en notación Dirac

Las posiciones en las tablas de Top Repositorios y Top Contribuidores usan notación ket:

| Posición clásica | Notación cuántica |
|------------------|-------------------|
| 1 | `\|1⟩` |
| 2 | `\|2⟩` |
| 3 | `\|3⟩` |
| ... | `\|n⟩` |

Cada `|n⟩` representa un eigenstate (estado propio) del operador de ranking.

### 8.2 Niveles de expertise cuánticos

En la tabla de contribuidores, el badge de expertise usa terminología de estados cuánticos:

| Score | Etiqueta cuántica | Significado |
|-------|-------------------|-------------|
| ≥ 90 | **Qubit Master** | Dominio total del qubit — máxima coherencia |
| ≥ 75 | **Entangled** | Estado entrelazado — alta correlación |
| ≥ 50 | **Superposed** | En superposición — potencial sin colapsar |
| < 50 | **Ground State** | Estado fundamental — mínima energía |

### 8.3 Efecto Quantum Tunneling en filas

Al hacer hover sobre una fila, un destello de luz cian→púrpura la barre horizontalmente (animación `tunneling`, 0.6s):
- Pseudo-elemento con gradiente lineal que se desplaza de `translateX(-100%)` a `translateX(100%)`.

**Analogía cuántica:** El efecto túnel cuántico permite a una partícula atravesar una barrera de potencial — aquí, el destello "atraviesa" la fila.

---

## 9. Navegación

### 9.1 Indicador cuántico activo (DashboardNav)

El indicador del ítem activo en la navegación lateral usa la animación `quantumPulse` (2.5s):
- Varía la altura de 14px a 18px.
- `box-shadow` dual cian + púrpura que pulsa en intensidad.
- Representa un qubit oscilando entre estados como un sistema cuántico no decoherido.

---

## 10. Footer

### 10.1 Circuito cuántico decorativo

| | |
|---|---|
| **Archivo** | `src/App.jsx` |
| **Concepto físico** | Circuito cuántico (quantum circuit) |

SVG que dibuja un circuito cuántico de 2 qubits con las puertas fundamentales:

```
|0⟩ ──[H]──●──[Z]──[H]──[M]──
            |
|0⟩ ────────⊕──────────────[M]──
```

**Puertas representadas:**
- **H (Hadamard):** crea superposición — rectángulo con texto "H".
- **CNOT (Controlled-NOT):** puerta de entrelazamiento — punto de control (●) arriba, target (⊕) abajo, línea vertical de conexión.
- **Z (Phase):** puerta de fase — rectángulo con "Z".
- **Medición (M):** arcos con agujas — símbolo estándar de medición en circuitos cuánticos.

Todo en gradiente cian→púrpura, con opacidad 0.6 que sube a 1 al hover del footer.

**Analogía:** Este circuito específico genera un par de Bell (máximamente entrelazado) y lo mide — el protocolo más básico de la computación cuántica.

---

## 11. Elementos Globales

### 11.1 Scrollbar cuántico

| | |
|---|---|
| **Archivo** | `src/index.css` |
| **Tecnología** | CSS WebKit customization + keyframes |

La barra de scroll del navegador se reemplaza con un diseño cuántico:
- **Track:** fondo oscuro semitransparente.
- **Thumb:** gradiente lineal cian→púrpura→cian con `background-size: 100% 200%` y animación `scrollbarPulse` (4s) que desplaza el gradiente verticalmente.
- **Hover:** velocidad duplicada (2s) y glow `box-shadow` cian.

---

## 12. Estados del Sistema

### 12.1 Banner de decoherencia (offline)

Cuando el backend está offline, aparece un banner sticky bajo el header:
- **Texto:** *"⚠️ Decoherencia detectada — Backend offline — Los datos mostrados son simulados"*.
- **Animación `decoherence`** (4s): aplica `skewX(±1deg)` y `translateX(±1px)` en momentos específicos, simulando pérdida de coherencia cuántica (el texto "tiembla").
- **LED rojo** parpadeante con `offlineBlink`.

**Analogía cuántica:** La decoherencia es el proceso por el cual un sistema cuántico pierde sus propiedades cuánticas al interactuar con el entorno — aquí, la pérdida de conexión con el backend "decohere" el sistema.

---

## 13. Resumen Técnico

### Inventario por tipo

| Categoría | Cantidad | Elementos |
|-----------|----------|-----------|
| Componentes React dedicados (Dashboard) | 4 activos | QuantumBackground, QuantumDivider, BlochSphere, WavefunctionCollapse |
| Componentes 3D del Universo | 5 ambientales + datos | CosmicRays, ElectronOrbits (Dyson Shell), GravitationalWaves, QuantumFoam, InterferenceGrid + entidades de datos (Processors, Qubits, Particles, Connections…) |
| Animaciones CSS (`@keyframes`) | 15+ | quantumShift, quantumPulse, orbitalPulse, superposition, decoherence, scanlineScroll, scanSweep, tunneling, phraseFade, scrollbarPulse, coreBreathe, haloPulse, orbitSpin, badgePop, retryPulse |
| Visualizaciones SVG | 4 | Circuito cuántico, átomo spinner, núcleo NetworkGraph, BlochSphere |
| Animaciones SVG (`<animateMotion>`) | 3 usos | Electrones del spinner, electrones del NetworkGraph, pulsos de energía |
| Texto/notación cuántica | 8 | Frases carga, `\|ψ⟩`, `\|FILTERED⟩`, `\|n⟩` rankings, `⟨name\|`, ecuación Schrödinger, operadores Ĥ/σ̂/Û, expertise labels |
| Efectos hover | 3 | WavefunctionCollapse, tunneling, operadores |
| Canvas API | 1 | QuantumBackground (partículas) |
| Shaders GLSL personalizados | 8 | CosmicRay (vertex+fragment), Dyson Shell edges (vertex+fragment), Dyson Shell nodes (vertex+fragment), QuantumFoam (vertex+fragment) |

### Tecnologías utilizadas

| Tecnología | Uso en diseño cuántico |
|------------|----------------------|
| **CSS Modules** | Estilos con scope — cada componente cuántico tiene su propio módulo CSS |
| **CSS Custom Properties** | Variables globales (`--color-accent`, `--color-secondary`, `--color-neon`) para coherencia cromática |
| **CSS `@keyframes`** | Animaciones de pulsación, rotación, desplazamiento, glow |
| **CSS pseudo-elementos** | Scanlines CRT, `\|ψ⟩` decorativo, operadores, tunneling sweep |
| **SVG inline** | BlochSphere, circuito cuántico, átomo, ondas |
| **SVG `<animateMotion>`** | Partículas viajeras (electrones orbitando, pulsos de energía) |
| **SVG filters** | `<feGaussianBlur>` para glow en partículas y líneas |
| **SVG gradients** | `<linearGradient>` cian→púrpura en ondas, líneas, paths |
| **Canvas 2D API** | QuantumBackground — partículas con rebote, conexiones, flashes |
| **React state** | Control de WavefunctionCollapse (hover → collapse), frases rotativas |
| **React refs** | IntersectionObserver para scroll-reveal de tarjetas |

### Conceptos de mecánica cuántica referenciados

| Concepto | Dónde se usa |
|----------|-------------|
| Superposición cuántica | Logo ENTANGLE (ghost text), estado checking `α\|0⟩+β\|1⟩`, WavefunctionCollapse (onda distribuida), frases de carga |
| Colapso de la función de onda | WavefunctionCollapse (onda → delta), tooltips ("medición colapsada"), `\|FILTERED⟩` badge, click → panel detalle en Universo 3D |
| Entrelazamiento cuántico | QuantumBackground (flashes entre partículas lejanas), puntos orbitales (par EPR), bridge users (sync flashes en Universo 3D) |
| Notación de Dirac (bra-ket) | Status badge (`\|0⟩`, `\|1⟩`), rankings (`\|n⟩`), filtered badge (`\|FILTERED⟩`), tooltips (`⟨name\|`), BlochSphere, circuito |
| Ecuación de Schrödinger | Hero section (iℏ ∂\|ψ⟩/∂t = Ĥ\|ψ⟩) |
| Esfera de Bloch | Componente BlochSphere (representación geométrica del qubit), ejes Bloch en repos del Universo 3D |
| Circuitos cuánticos | Footer (H, CNOT, Z, medición) |
| Puertas cuánticas | Operadores decorativos (Ĥ, σ̂, Û), puerta Hadamard en frases de carga |
| Decoherencia | Banner offline, dimming selectivo en Universo 3D, shockwaves desde procesadores |
| Efecto túnel | Hover en filas de tabla (tunneling sweep), pulsos viajeros por canales en Universo 3D |
| Delta de Dirac | WavefunctionCollapse (estado colapsado) |
| Modelo atómico | Spinner de carga (órbitas + electrones), núcleo del NetworkGraph |
| Función de onda | QuantumDivider (ψ(x), φ(x)), WavefunctionCollapse (\|ψ\|²) |
| Estados propios (eigenstates) | Rankings `\|n⟩`, expertise labels (Ground State, Superposed, Entangled, Qubit Master) |
| Rayos cósmicos | CosmicRays en Universo 3D (estrellas fugaces de 6 colores con colisión contra Dyson Shell) |
| Esfera de Dyson | ElectronOrbits en Universo 3D (esfera geodésica icosaédrica R=3500, impactos con ondas de choque) |
| Ondas gravitacionales | GravitationalWaves en Universo 3D (anillos concéntricos desde las orgs más grandes) |
| Espuma cuántica | QuantumFoam en Universo 3D (200 partículas virtuales parpadeando, jitter de Heisenberg) |
| Interferencia cuántica | InterferenceGrid en Universo 3D (campo de 4900 puntos con 5 fuentes de onda) |
| Tomografía cuántica | Tour Cósmico (recorrido guiado por waypoints como secuencia de mediciones en diferentes bases) |
| **Decoherencia cuántica** | **Transición de salida del Universo (7 fases: UI fade, universe collapse, canvas implosion, singularity pulse, shockwave expand, particle burst, collapse flash)** |

---

## 14. Transición de Salida del Universo — Quantum Decoherence

Al cerrar el Universo 3D de colaboración, se reproduce una secuencia de "decoherencia cuántica" que transiciona visualmente de vuelta al dashboard. Todos los efectos son **CSS puro** (animaciones `@keyframes` en el compositor GPU), sin afectar al render loop de Three.js.

### 14.1 Arquitectura

| Capa | Elemento | Archivo |
|------|----------|---------|
| Estado React | `isExiting` (`useState`) | `UniverseView.jsx` |
| Orquestación | `handleExit` (`useCallback`) | `UniverseView.jsx` |
| Overlay DOM | `.exitOverlay` con 5 hijos | `UniverseView.jsx` |
| Animaciones CSS | 7 `@keyframes` independientes | `UniverseView.module.css` |

### 14.2 Flujo de ejecución

```
ESC / click close → handleExit()
  ├── setIsExiting(true)
  ├── CSS classes activadas:
  │   ├── .universeExiting → universeCollapse (1.8s)
  │   ├── .canvasExiting   → canvasImplode (1.7s)
  │   └── .exitOverlay monta 5 elementos:
  │       ├── .exitSingularity  → singularityPulse (1.8s)
  │       ├── .exitShockwave    → shockwaveExpand (1.5s, delay 0.35s)
  │       ├── .exitShockwave2   → shockwaveExpand (1.4s, delay 0.5s)
  │       ├── .exitParticles    → particlesFly (1.6s, delay 0.3s)
  │       └── .exitFlash        → collapseFlash (1.8s)
  └── setTimeout(1800ms):
      ├── closeCollaborationGraph() → desmonta UniverseView
      └── setIsExiting(false) → reset para próxima apertura
```

### 14.3 Fases visuales

| # | Fase | Duración | Delay | Concepto cuántico |
|---|------|----------|-------|-------------------|
| 1 | UI Fade | 0.5s | 0s | Pérdida de instrumentación — el observador pierde la capacidad de medir |
| 2 | Universe Collapse | 1.8s | 0s | Cascada energética — brightness 1→3→0.5, blur 0→20px |
| 3 | Canvas Implosion | 1.7s | 0s | Colapso del espacio-tiempo — scale 1→0, rotate 0→5° |
| 4 | Singularity Pulse | 1.8s | 0s | Singularidad central — punto 0→8×→0 con halos concéntricos |
| 5 | Shockwave Expand | 1.5s/1.4s | 0.35s/0.5s | Ondas de decoherencia — anillos cian y púrpura, scale 0→40× |
| 6 | Particle Burst | 1.6s | 0.3s | Dispersión de la función de onda — 12 partículas radiales |
| 7 | Collapse Flash | 1.8s | 0s | Colapso total — flash blanco radial, mix-blend-mode: screen |

### 14.4 Paleta cromática

| Color | Uso en la transición |
|-------|---------------------|
| Blanco `#ffffff` | Singularidad central, flash final |
| Cian `rgba(0, 212, 228)` | Shockwave primario, halos, partículas |
| Púrpura `rgba(157, 111, 219)` | Shockwave secundario, halos exteriores |
| Verde `rgba(0, 255, 159)` | Partículas de dispersión (acento) |

### 14.5 Detalles técnicos

- **Easing functions**: `cubic-bezier(0.55, 0, 1, 0.45)` para colapso (acelerativo), `cubic-bezier(0.22, 1, 0.36, 1)` para expansión (desacelerativo)
- **`mix-blend-mode: screen`** en el flash final: suma aditiva de luz sobre la escena oscurecida
- **`pointer-events: none`** en el overlay: no intercepta clicks durante la animación
- **`transform-origin: center center`** en canvas: la implosión converge al centro exacto
- Duración total calibrada a **~1.8s** — suficiente para apreciar cada fase sin perder dramatismo

---

*Documento generado para la memoria del TFG — ENTANGLE: Análisis de Ecosistemas de Software Cuántico*  
*Universidad de Castilla-La Mancha (UCLM)*
