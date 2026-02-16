# Registro de Optimizaciones de Rendimiento y UX

## 📋 Resumen

Documento que recoge todas las mejoras de rendimiento, correcciones de UX y rediseños visuales realizados sobre el frontend de **ENTANGLE — Quantum Software Ecosystem Analytics**.

Rama: `grafo`  
Fecha: Febrero 2026

---

## 1. Web Worker para Layout del Universo 3D

**Problema**: El cálculo del layout de nodos (`computeLayout`) ejecuta un algoritmo O(n²~n³) con ~30.000 nodos y ~100.000 enlaces, bloqueando el hilo principal durante varios segundos y congelando toda la UI.

**Solución**: Mover el cálculo a un **Web Worker** dedicado.

**Archivos creados/modificados**:
- `src/components/Universe/computeLayout.worker.js` — Worker que contiene:
  - Clase `Vec3` para aritmética vectorial
  - Algoritmo de layout en 5 fases (posicionamiento por comunidad → repulsión → atracción → resolución de colisiones → centrado)
  - Serialización de resultados para transferencia al hilo principal
- `src/components/Universe/UniverseView.jsx` — Integración:
  - `layoutWorkerRef` (ref al Worker)
  - `layoutRequestIdRef` (previene race conditions entre peticiones)
  - `universeData` como `useState` (sustituye cálculo síncrono)
  - Worker se termina con `worker.terminate()` en cleanup del `useEffect`

---

## 2. Deferencia del Canvas Three.js

**Problema**: Three.js parsea la escena inmediatamente al montar el `<Canvas>`, compitiendo con el Worker por recursos y provocando que las animaciones del loader se congelen.

**Solución**: Diferir el montaje del Canvas con doble `requestAnimationFrame`.

**Archivos modificados**:
- `src/components/Universe/UniverseView.jsx`:
  - Estado `canvasMounted` (inicia `false`)
  - `useEffect` que activa `canvasMounted = true` tras dos rAFs sucesivos
  - El `<Canvas>` solo se renderiza cuando `canvasMounted && universeData` son truthy

---

## 3. Loader CSS-Only con Átomo 3D

**Problema**: El loader anterior utilizaba un SVG con `<animateMotion>` que se congelaba porque el hilo principal estaba bloqueado por Three.js (a pesar de la deferencia del Canvas).

**Solución**: Reemplazar el SVG animado por un **átomo 3D puramente CSS** que usa animaciones del compositor (`transform`, `opacity`), las cuales se ejecutan en el GPU y no dependen del hilo principal.

**Archivos modificados**:
- `src/components/Universe/UniverseView.jsx`:
  - Estructura: `.loaderAtomCSS` → 3× `.loaderOrbitPlane` (rotados 0°/60°/120° en Y, 72° en X para perspectiva) → dentro de cada plano: `.loaderOrbitRing` (elipse visible) + `.loaderElSpin` (brazo giratorio) + `.loaderElDot` (electrón con contra-rotación)
  - Núcleo central: `.loaderAtomCoreCSS`
- `src/components/Universe/UniverseView.module.css`:
  - `perspective: 600px` en el contenedor
  - `rotateX(72deg)` + `rotateY(0/60/120deg)` para las 3 órbitas elípticas
  - Electrones: `loaderElSpin1/2/3` con duraciones 1.8s/2.3s/2.8s
  - Contra-rotación `rotateX(-72deg)` en `.loaderElDot` para mantener los puntos circulares
  - Glow dual con `box-shadow` en electrones + `drop-shadow` en núcleo

---

## 4. Mensajes del Loader sin JavaScript

**Problema**: Los mensajes del loader usaban `setInterval` + estado React (`loaderMsg`), que dejaba de actualizarse cuando el hilo principal se bloqueaba.

**Solución**: **Animación CSS pura** para ciclar los mensajes.

**Archivos modificados**:
- `src/components/Universe/UniverseView.jsx`:
  - Eliminados: estado `loaderMsg`, constante `LOADER_MESSAGES`, `setInterval`/`clearInterval`
  - 4 elementos `.loaderMsgItem` estáticos con textos fijos
- `src/components/Universe/UniverseView.module.css`:
  - Keyframe `loaderMsgCycle` (25% visible, 75% invisible, total 6.4s)
  - `animation-delay` escalonado: 0s / 1.6s / 3.2s / 4.8s
  - Solo un mensaje visible a la vez mediante `opacity` + `translateY`

---

## 5. Corrección de Controles del Universo (pointer-events)

**Problema**: Al entrar en el Universo 3D, los controles de UI (barra de búsqueda, toolbar de lentes, barra de tunneling, panel de detalle, ayuda) no respondían a clics porque `.universeUIVisible` tenía `pointer-events: auto` sobre un `div` de viewport completo (`inset: 0`), capturando todos los eventos antes de que llegaran al Canvas.

**Solución**: Eliminar `pointer-events: auto` del contenedor global y añadirlo individualmente a cada control interactivo.

**Archivos modificados**:
- `src/components/Universe/UniverseView.module.css`:
  - `.universeUIVisible` → SIN `pointer-events: auto`
  - `pointer-events: auto` añadido a: `.searchBar`, `.lensToolbar`, `.tunnelingBar`, `.detailPanel`, `.helpBtn`, `.helpPanel`
  - `.header` mantiene `pointer-events: none` con `.headerRight` a `pointer-events: all`

---

## 6. Rediseño de la Pantalla de Carga de App.jsx

**Problema**: Al completar la carga del dashboard, los iconos genéricos (`FaCheckCircle` / `FaTimesCircle`) aparecían de golpe con un `scaleIn` poco profesional, el texto era genérico, y se mostraban durante apenas 800ms.

### 6.1 Indicadores SVG draw-on

**Solución**: Sustituir los iconos de react-icons por **SVGs animados con draw-on** (trazo que se dibuja progresivamente).

**Archivos modificados**:
- `src/App.jsx`:
  - Eliminados imports: `FaCheckCircle`, `FaTimesCircle`
  - **Éxito**: SVG con `<circle>` (stroke-dashoffset 151→0, 0.5s) + `<path>` check (delay 0.45s)
  - **Error**: SVG con `<circle>` + 2× `<line>` cruz (delays escalonados)
  - Atom SVG no se desmonta — se desvanece con clase `.atomFadeOut` (`opacity: 0`, `scale: 0.3`)
  - `.resultIndicator` se superpone al átomo con `position: absolute; inset: 0`
- `src/App.module.css`:
  - `.loadingSpinner` → `height: 80px` fija (evita salto de layout)
  - `.atomContainer` → `position: relative; width: 80px; height: 80px`
  - `.atomFadeOut` → `opacity: 0; transform: scale(0.3); transition: 0.4s`
  - `@keyframes drawCircle` (stroke-dashoffset)
  - `@keyframes drawCheck`, `@keyframes drawCrossA`, `@keyframes drawCrossB`
  - Eliminados: `.successIcon`, `.errorIcon`, `@keyframes scaleIn`

### 6.2 Texto temático cuántico

- **Éxito**: *"Coherencia cuántica establecida"*
- **Error**: *"Decoherencia detectada — modo simulación"*
- `.resultText` animado con `resultTextIn` (blur+slide, delay 0.5s)

### 6.3 Timing mejorado

- Éxito: 2000ms de visualización (antes 800ms)
- Error: 2500ms de visualización
- Luego 500ms de fade-out antes de renderizar el dashboard

---

## 7. Rediseño del CollaborationBanner como Portal Cuántico

**Problema**: El banner de acceso al grafo de colaboración era un rectángulo simple con un icono SVG de nodos, un icono `FiActivity`, texto "¡Grafo de Colaboración disponible!" y un botón "Explorar" genérico. No comunicaba la importancia del Universo 3D.

### 7.1 Nuevo diseño "Portal Cuántico"

**Archivos modificados**:
- `src/components/Dashboard/CollaborationBanner.jsx` — Reescritura completa:
  - **Fondo estelar**: 24 `<span>` con posiciones pseudo-aleatorias y parpadeo desfasado (`starTwinkle`)
  - **Línea luminosa superior**: Degradado cyan → violeta → verde, se expande al hover
  - **Átomo orbital SVG**: 3 elipses + 3 electrones con `<animateMotion>` + filtro glow
  - **Anillos de pulso**: 2 divs circulares expandiéndose alternadamente
  - **Etiqueta**: `QUANTUM UNIVERSE` (mono, tracking amplio)
  - **Título**: "Explorar el Universo de Colaboración"
  - **CTA**: "Entrar" con flecha SVG + `.ctaGlow` que aparece al hover
  - Eliminadas dependencias: `FiActivity`, `FiArrowRight`
- `src/components/Dashboard/CollaborationBanner.module.css` — Reescritura completa:
  - Fondo oscuro inmersivo (`rgba(5, 5, 20, 0.95)`)
  - Clases nuevas: `.starfield`, `.star`, `.topEdge`, `.portalIcon`, `.portalAtom`, `.pOrbit1/2/3`, `.portalRing`, `.portalRing2`, `.label`, `.subtitle`, `.ctaText`, `.ctaIcon`, `.ctaGlow`
  - Animaciones: `starTwinkle`, `pSpin`, `portalRingPulse`
  - Responsive design con breakpoint 768px

### 7.2 Corrección de métricas

**Problema**: El frontend mostraba "12621 usuarios puente · 0 repositorios compartidos · 0 comunidades" porque:
- `shared_repos_count` → no existe, el backend envía `connected_repo_pairs`
- `communities_count` → no se calcula en el endpoint `/collaboration/discover`
- `bridge_users_count` → coincide pero estaba inflado

**Solución**: Usar los campos reales del backend:
```jsx
`${metrics.graph_nodes} nodos · ${metrics.graph_links} enlaces · ${metrics.bridge_users_count} usuarios puente`
```

### 7.3 Reubicación

**Antes**: Entre Hero+QuantumDivider y la sección Charts (sin relación contextual).  
**Después**: Justo antes de la sección Network (ambos tratan de redes/colaboración).

**Archivos modificados**:
- `src/App.jsx`:
  - `<CollaborationBanner />` movido de después del primer `<QuantumDivider />` a justo antes de `<div id="section-network">`

### 7.4 Aparición suave sin desplazamiento

**Problema**: El banner aparecía de golpe empujando el contenido hacia abajo.

**Solución**:
1. **Wrapper con max-height**: El banner se envuelve en un `.wrapper` con `max-height: 0` → `160px` animado, evitando saltos de layout.
2. **IntersectionObserver**: El banner solo se revela cuando el usuario hace scroll hasta él (threshold 15%), con la misma transición `translateY(20px) → 0` + fade-in que usan las demás secciones del dashboard.

**Archivos modificados**:
- `src/components/Dashboard/CollaborationBanner.jsx`:
  - `useRef` + `IntersectionObserver` → estado `inView`
  - Clase `revealed = shouldShow && visible && inView` controla la animación
  - El wrapper siempre se renderiza (no return null) para reservar espacio
- `src/components/Dashboard/CollaborationBanner.module.css`:
  - `.wrapper` → `max-height: 0; overflow: hidden; opacity: 0; transform: translateY(20px)`
  - `.wrapperVisible` → `max-height: 160px; opacity: 1; transform: translateY(0)`
  - Transiciones con `cubic-bezier(0.22, 1, 0.36, 1)` (ease-out suave)

---

## Resumen de Archivos Afectados

| Archivo | Tipo de cambio |
|---------|---------------|
| `src/components/Universe/computeLayout.worker.js` | **Nuevo** — Web Worker |
| `src/components/Universe/UniverseView.jsx` | Modificado — Worker, Canvas defer, loader CSS |
| `src/components/Universe/UniverseView.module.css` | Modificado — Átomo 3D CSS, mensajes CSS, pointer-events |
| `src/App.jsx` | Modificado — Loading screen, posición del banner |
| `src/App.module.css` | Modificado — Draw-on SVG, layout fijo, timing |
| `src/components/Dashboard/CollaborationBanner.jsx` | **Reescrito** — Portal cuántico |
| `src/components/Dashboard/CollaborationBanner.module.css` | **Reescrito** — Estilos del portal |

---

## Principios Aplicados

- **Animaciones en compositor**: Solo `transform` y `opacity` para que se ejecuten en GPU sin depender del hilo principal
- **Sin timers JS para animaciones**: CSS puro (`animation-delay`, keyframes) en vez de `setInterval`/`setTimeout` para loops visuales
- **Pointer-events selectivos**: Nunca `pointer-events: auto` en capas de viewport completo
- **Layout estable**: Contenedores con dimensiones fijas para evitar CLS (Cumulative Layout Shift)
- **IntersectionObserver**: Reveal on scroll para coherencia visual con el resto del dashboard
- **Campos de API verificados**: Usar nombres de campo reales del backend, no asumir convenciones
