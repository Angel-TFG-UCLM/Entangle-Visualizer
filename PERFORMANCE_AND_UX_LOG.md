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

## 8. Eliminación del Re-render Storm (useRef para animación)

**Problema**: `BuildDirector` llamaba a `setBp()` (React `useState` setter) en **cada frame a 60fps**, provocando ~60 re-renders/segundo de todo el subárbol React. Esto saturaba el hilo principal con reconciliación DOM innecesaria.

**Solución**: Reemplazar `useState` por `useRef` para el progreso de animación.

**Archivos modificados**:
- `src/components/Universe/UniverseView.jsx`:
  - `bpRef = useRef({ genesis:0, vacuum:0, processors:0, qubits:0, particles:0, entanglement:0 })`
  - `BuildDirector` escribe directamente a `progressRef.current[key]` — cero re-renders
  - Los 12 componentes animados leen `progressRef.current[progressKey]` en `useFrame`
  - Resultado: **0 re-renders React** desde el bucle de animación

---

## 9. GPU Clip-Space Culling (invisibilidad garantizada)

**Problema**: `gl_PointSize = 0` se clampea a **1px mínimo** en muchas GPUs. Con 27K partículas + blending aditivo + Bloom, esto generaba un "polvo" visible pre-Big Bang.

**Solución**: Mover vértices fuera del clip space (`vec4(9999, 9999, 9999, 1)`) cuando deben ser invisibles.

**Archivos modificados**:
- `src/components/Universe/UniverseView.jsx` — 4 vertex shaders actualizados:
  - **PARTICLE_VERTEX**: `if (localP < 0.001) { gl_Position = vec4(9999...); return; }`
  - **BOND_VERTEX**: `if (p < 0.001) { ... }`
  - **CHANNEL_VERTEX**: `if (uOpacity < 0.001) { ... }`
  - **ARC_VERTEX**: `if (uOpacity < 0.001 || uProgress < 0.001) { ... }` + fix de edge case `smoothstep(max(aT-0.03, 0.001), aT+0.01, uProgress)` donde `aT=0, uProgress=0` devolvía `vis=1.0`

---

## 10. Canvas frameloop Condicional

**Problema**: Three.js renderizaba frames completos durante la carga (incluyendo 27K partículas, shaders, Bloom), incluso cuando la escena debía estar oculta tras el loader.

**Solución**: `frameloop='demand'` durante la carga → `'always'` al iniciar la animación.

**Archivos modificados**:
- `src/components/Universe/UniverseView.jsx`:
  - `<Canvas frameloop={animationStarted ? 'always' : 'demand'}>`
  - La GPU no renderiza ni un solo frame innecesario durante el montaje progresivo

---

## 11. Montaje Progresivo en 9 Stages

**Problema**: Montar todos los componentes 3D simultáneamente bloqueaba el hilo principal (geometrías, buffers, shaders de 27K+ nodos).

**Solución**: 9 stages con delays generosos entre cada montaje.

**Archivos modificados**:
- `src/components/Universe/UniverseView.jsx`:
  - `MOUNT_STAGES = 9`, `SCENE_READY_STAGE = 5`
  - `STAGE_DELAYS = [200, 300, 200, 500, 800, 600, 900, 200, 250, 200]`
  - Orden: 1→Procesadores, 2→Anillos, 3→Qubits, 4→Partículas (27K), 5→Bonds, 6→Canales (38K×35), 7→Arcos+Nubes+Ejes, 8→Efectos ambientales
  - `sceneReady` señalizado en stage 5 → fade del loader → `animationStarted=true`

---

## 12. Optimización de EntanglementChannels

**Problema**: `useMemo` realizaba **1.33M iteraciones síncronas** al montar (38K conexiones × 35 puntos por conexión = posiciones iniciales), bloqueando el main thread 200-500ms. Además, `useFrame` ejecutaba esas 1.33M iteraciones **cada frame**, incluso cuando `progress=0` (primeros 6.5 segundos — todo el presupuesto de 16ms a 60fps).

**Solución**:
1. **useMemo ligero**: Solo calcula meta + geometría pre-computada (38K iteraciones). Las posiciones se inicializan a cero; `useFrame` las llena al activarse entanglement.
2. **Early return en useFrame**: `if (p < 0.01) return` — salta las 1.33M iteraciones durante los primeros 6.5s, ahorrando 15-50ms/frame.
3. **Pre-computed connGeom**: Dirección, longitud y perpendicular calculados una sola vez — `useFrame` usa aritmética escalar sin allocations.

**Archivos modificados**:
- `src/components/Universe/UniverseView.jsx`:
  - `useMemo`: eliminado el loop `for (i < POINTS_PER_CONN)` de 35 iteraciones × 38K conexiones
  - `useFrame`: opacidad actualizada antes del `return` anticipado, loop solo ejecuta cuando `p >= 0.01`
  - `connGeom[]`: `{ dx, dy, dz, len, px, py, pz }` por conexión — 0 `Vector3` allocations por frame

---

## 13. processLayoutResultAsync — Chunks Más Pequeños

**Problema**: El procesamiento de resultados del Worker convertía 27K posiciones y 98K conexiones en chunks que eran demasiado grandes, contribuyendo al bloqueo del hilo principal.

**Solución**: Reducir tamaños de chunk y aumentar tiempo de yield.

**Archivos modificados**:
- `src/components/Universe/UniverseView.jsx`:
  - `POS_CHUNK`: 800 → **500**
  - `CONN_CHUNK`: 2000 → **1000**
  - `yieldToMain()`: `setTimeout(r, 4)` → `setTimeout(r, 8)` (más tiempo al browser entre chunks)

---

## 14. Group visible={false} — Barrera Nuclear Anti-Fugas

**Problema**: A pesar de las guardas individuales por shader (clip-space culling, opacity=0), algunos artefactos visuales seguían filtrándose pre-Big Bang por interacción entre Bloom, GPU clamping y blending aditivo.

**Solución**: Envolver **todos** los componentes staged en `<group visible={startAnimation}>`.

**Archivos modificados**:
- `src/components/Universe/UniverseView.jsx`:
  - `<group visible={startAnimation}>` envuelve stages 1-8
  - THREE.js no renderiza nada del grupo mientras `visible=false` — imposible que ningún shader, geometría o artefacto de Bloom aparezca antes del Big Bang

---

## 15. Staggering Per-Particle (Materialización Progresiva)

**Problema**: Las 27K partículas (users) dependían del mismo `uProgress` global — cuando cruzaba 0.001, ALL 27K aparecían simultáneamente como un flash.

**Solución**: Staggering individual en el vertex shader usando `aSeed`.

**Archivos modificados**:
- `src/components/Universe/UniverseView.jsx` — `PARTICLE_VERTEX`:
  - `stagger = fract(aSeed * 3.7) * 0.55` — offset único 0-55% del rango por partícula
  - `localP = smoothstep(stagger, stagger + 0.45, p)` — cada partícula materializa en su propio momento
  - Las que no han alcanzado su turno (`localP < 0.001`) se envían fuera del clip space
  - Resultado: condensación cuántica progresiva durante ~1.5 segundos

---

## 16. Gating de Efectos Ambientales

**Problema**: `HawkingRadiation`, `TunnelingPulses` y `DecoherenceWaves` se hacían visibles antes de tiempo — algunas antes del Big Bang, otras antes de que los procesadores existieran.

**Solución**: Prop `startAnimation` + delays internos.

**Archivos modificados**:
- `src/components/Universe/UniverseView.jsx`:
  - **HawkingRadiation**: `startAnimation` prop + `animTimer` ref + `DELAY_BEFORE_VISIBLE = 4.0s` — fade-in solo tras 4 segundos de animación (procesadores ya visibles)
  - **TunnelingPulses**: `startAnimation` prop + `DELAY_BEFORE_VISIBLE = 7.0s` + material inicia con `opacity: 0`
  - **DecoherenceWaves**: `startAnimation` prop — timer no cuenta down hasta que empieza la animación
  - Los tres se montan en stage 8 (último) y pasan `startAnimation` desde `QuantumScene`

---

## 17. Ajuste de Fase Vacuum + Reducción de Prominencia

**Problema**: Las "fluctuaciones del vacío" (`QuantumVacuum` — 400 puntos `#4488ff`) y el "campo de interferencia" (`InterferenceField` — 600 puntos `#2244ff`) aparecían 1 segundo antes que los procesadores (vacuum a t=1.8s, processors a t=2.8s), creando puntos azul oscuro sin contexto.

**Solución**: Retrasar vacuum y reducir prominencia visual.

**Archivos modificados**:
- `src/components/Universe/UniverseView.jsx`:
  - `PHASE_TIMINGS.vacuum`: `[1.8, 1.5]` → `[2.5, 2.0]` — emerge casi simultáneamente con procesadores
  - **QuantumVacuum**: opacity `0.3` → `0.15 * p`, tamaño `0.3` → `0.2`, color `#4488ff` → `#3366aa`
  - **InterferenceField**: opacity `0.12` → `0.06`, tamaño `0.6` → `0.4`, multiplicador `0.8` → `0.5`
  - Resultado: fondo ambiental sutil que acompaña a los procesadores, no protagonista

---

## 18. Átomo SVG Realista en Pantalla de Carga

**Problema**: El átomo CSS 3D con `perspective + rotateX` funcionaba pero era visualmente simple — borders circulares con dots posicionados, sin glow realista ni profundidad.

**Solución**: Reemplazar por un **átomo SVG inline** con órbitas elípticas reales, filtros de glow y electrones con doble capa (halo + centro blanco).

**Archivos modificados**:
- `src/components/Universe/UniverseView.jsx`:
  - SVG `viewBox="-60 -60 120 120"` con:
    - `<defs>`: `radialGradient#nucleusGrad`, `filter#glowNucleus` (Gaussian blur), `filter#glowElectron` (double blur), `filter#glowOrbit`
    - 3 `<ellipse>` con rotaciones -20°/40°/100° y strokes semi-transparentes (cyan/purple/green)
    - 3 grupos de electrones con doble `<circle>` (halo exterior coloreado + centro blanco brillante)
    - Núcleo: `<circle>` con gradient radial (blanco → cyan → transparente)
  - Eliminado: `.loaderAtomCSS` y todos los divs de órbitas/electrones/núcleo CSS
- `src/components/Universe/UniverseView.module.css`:
  - **Eliminados**: `.loaderAtomCSS`, `.loaderOrbitPlane`, `.loaderPlane1/2/3`, `.loaderOrbitRing1/2/3`, `.loaderElSpin`, `.loaderElSpin1/2/3`, `.loaderElDot`, `.loaderElDot1/2/3`, `.loaderAtomCoreCSS`, `@keyframes loaderRotate`, `@keyframes loaderCorePulse`
  - **Añadidos**: `.loaderAtomSVG` (120×120px), `.svgOrbit1/2/3` (pulse opacity), `.svgElectronGroup1/2/3` (rotate 2.4s/3.2s reverse/4s), `.svgNucleus` (scale pulse)
  - **0 impacto rendimiento**: SVG + CSS `transform: rotate()` = GPU-accelerated, sin repaints

---

## 19. Bridge Reveal — Transición Verde → Dorado

**Problema**: Los usuarios bridge aparecían directamente en dorado (#ffbd00), sin relación narrativa con la secuencia de animación. No había "descubrimiento" visual de quiénes son bridges.

**Solución**: Todos los users nacen verdes; los bridges transicionan progresivamente a dorado durante la fase de entanglement.

**Archivos modificados**:
- `src/components/Universe/UniverseView.jsx`:
  - **PARTICLE_VERTEX**:
    - Nuevo uniform `uBridgeReveal` (driven por `progressRef.current.entanglement`)
    - `bStagger = fract(aSeed * 5.3) * 0.35` — cada bridge tiene su momento de revelación
    - `bridgeBlend = smoothstep(bStagger, bStagger + 0.5, uBridgeReveal)` — transición suave 0→1
    - `vBridgeBlend` varying pasado al fragment shader
    - Tamaño: `mix(normalSize, bridgeSize, bridgeBlend)` — crece gradualmente
    - Glow: `mix(1.0, 1.0 + flash, bridgeBlend)` — intensidad crece con la revelación
    - Density: `mix(aDensity, max(aDensity, 0.5), bridgeBlend)` — bridges preservan visibilidad
  - **PARTICLE_FRAGMENT**:
    - `baseCol = mix(uColorNormal, uColorBridge, vBridgeBlend)` — verde → dorado progresivo
    - Eliminado: `vIsBridge > 0.5 ? uColorBridge : uColorNormal` (binario)
  - **ShaderMaterial**: añadido `uBridgeReveal: { value: 0.0 }`
  - **useFrame**: `mat.uniforms.uBridgeReveal.value = easeOutCubic(progressRef.current.entanglement || 0)`
  - **Secuencia**: t=5.5-7.0s todos emergen verdes → t=6.5-8.3s bridges transicionan a dorado staggered

---

## Resumen de Archivos Afectados

| Archivo | Tipo de cambio |
|---------|---------------|
| `src/components/Universe/computeLayout.worker.js` | **Nuevo** — Web Worker: layout 5 fases, Jenks Natural Breaks, mapeo log continuo |
| `src/components/Universe/computeDetailData.worker.js` | **Nuevo** — Web Worker: panel de detalle, radar, roles de red (7 niveles), carga progresiva |
| `src/components/Universe/UniverseView.jsx` | Modificado — Worker, Canvas defer, loader SVG, montaje progresivo, shaders GPU, bridge reveal, efectos gating, optimizaciones, Jenks inline |
| `src/components/Universe/UniverseView.module.css` | Modificado — Átomo SVG, mensajes CSS, pointer-events |
| `src/App.jsx` | Modificado — Loading screen, posición del banner |
| `src/App.module.css` | Modificado — Draw-on SVG, layout fijo, timing |
| `src/components/Dashboard/CollaborationBanner.jsx` | **Reescrito** — Portal cuántico |
| `src/components/Dashboard/CollaborationBanner.module.css` | **Reescrito** — Estilos del portal |
| `Backend/src/analysis/network_metrics.py` | Proveedor de `collab_centrality_raw` y `collab_connectivity_raw` |
| `Backend/src/api/routes.py` | Sirve `compact_node_metrics` con ambas métricas (raw + percentil) |
| `Backend/scripts/_check_org_scores.py` | **Nuevo** — Verificación de distribución de scores |
| `Backend/scripts/_zone_analysis.py` | **Nuevo** — Análisis de gaps y fronteras |
| `Backend/scripts/_validate_jenks.py` | **Nuevo** — Validación de Jenks con GVF |

---

## Principios Aplicados

- **Animaciones en compositor**: Solo `transform` y `opacity` para que se ejecuten en GPU sin depender del hilo principal
- **Sin timers JS para animaciones**: CSS puro (`animation-delay`, keyframes) en vez de `setInterval`/`setTimeout` para loops visuales
- **Pointer-events selectivos**: Nunca `pointer-events: auto` en capas de viewport completo
- **Layout estable**: Contenedores con dimensiones fijas para evitar CLS (Cumulative Layout Shift)
- **IntersectionObserver**: Reveal on scroll para coherencia visual con el resto del dashboard
- **Campos de API verificados**: Usar nombres de campo reales del backend, no asumir convenciones
- **useRef para animación**: Escribir progreso directamente al ref en `useFrame` — cero re-renders React desde el bucle de render
- **GPU clip-space culling**: Mover vértices a `vec4(9999,9999,9999,1)` cuando deben ser invisibles — bypasses the GPU's minimum `gl_PointSize` clamping
- **Early returns en useFrame**: Saltar loops pesados cuando el progreso es 0 — ahorra 15-50ms/frame con 1.33M iteraciones
- **Montaje progresivo con yields**: Chunks pequeños + `yieldToMain()` para evitar "página no responde"
- **Staggering per-elemento**: Seeds pseudo-aleatorios en shaders GLSL para materialización progresiva vs flash simultáneo
- **Narrativa visual coherente**: Bridges se "descubren" durante entanglement, no aparecen pre-etiquetados
- **Fronteras data-driven**: Algoritmo de Jenks Natural Breaks (Fisher 1958) para que las zonas emerjan de la distribución de los datos, no de constantes arbitrarias

---

## 20. Web Worker para Panel de Detalle

**Problema**: Al hacer clic en una entidad, `computeDetailData` (~340 líneas) ejecutaba cálculos O(n²) en el hilo principal (iterar todos los repos×usuarios, calcular radar, health score, knowledge flows, key dependencies). Esto congelaba el grafo 3D 200-500ms.

**Solución**: Mover toda la computación del panel a un **Web Worker** dedicado.

**Archivos creados/modificados**:
- `src/components/Universe/computeDetailData.worker.js` — **Nuevo**:
  - Función `computeDetailData()` con ~500 líneas de lógica
  - Calcula para orgs: repos, contributors, bridges, lang breakdown, cross-pollination, health score, knowledge flows, key dependencies
  - Calcula para repos: users, bridge users, org diversity, hub score
  - Calcula para users: repos, orgs, langs, co-contributors, expertise
  - Genera: radar axes (5 ejes), network role, analysis text
- `src/components/Universe/UniverseView.jsx`:
  - `detailWorkerRef` = `useRef` al Worker
  - `detailData` = `useState(null)` (antes era `useMemo` síncrono)
  - `detailLoading` = `useState(false)` con indicador visual
  - Worker se crea en mount, `postMessage` en cada cambio de `selectedEntity`
  - Inline `computeDetailData` eliminado (~340 líneas menos en el componente)

---

## 21. Panel Expandido — Rediseño como Overlay 2-Columnas

**Problema**: El panel de detalle compacto (~320px lateral) no tenía espacio para mostrar análisis avanzados, matrices o simulaciones.

**Solución**: Modo expandido como overlay centrado con layout 2 columnas.

**Archivos modificados**:
- `src/components/Universe/UniverseView.jsx`:
  - Botón expand/compact con `detailExpanded` toggle
  - Layout: sidebar (320px) + main area con tabs
  - 3 tabs: Info (stats, langs, health), Red (centralidad, bus factor, deps), Explorar (conexiones)
  - Animaciones: `slideInRight` con scale, blur backdrop, `slideOutRight` al cerrar
- `src/components/Universe/UniverseView.module.css`:
  - `.detailPanelExpanded`: `min(1100px, calc(100vw - 60px))`, max-height `calc(100vh - 60px)`
  - `.detailSidebar`: 320px fijo, `scrollbar-gutter: stable`
  - `.detailMain`: flex-grow con padding y scrollbar propio
  - Diseño `display: contents` en modo compacto para reutilizar componentes

---

## 22. Cuatro Features Avanzadas del Panel

**Implementación**: Cuatro nuevas secciones solo visibles en modo expandido.

### 22.1 Impact Simulation ("¿Qué pasaría si…?")
- Simula la pérdida de los 3 key dependencies más críticos
- Calcula: repos afectados, bridge connections lost, org connections lost, health delta
- Severidad: critical (pierde org connections) / high (>2 repos) / moderate
- Cards con badges de severidad coloreados

### 22.2 Collaboration Matrix (Heatmap)
- Matriz NxN (max 8 repos) de contributors compartidos entre repos de una org
- Grid CSS con headers rotados 45°, celdas coloreadas por intensidad
- Diagonal muestra contributors totales, off-diagonal muestra shared
- Solo orgs con 2-15 repos

### 22.3 Similar Entities
- Calcula vector radar (5D) para TODAS las entidades del mismo tipo
- Distancia euclidiana normalizada → porcentaje de similaridad
- Top 5 con barras de progreso y click-to-navigate
- Busca orgs similares entre orgs, repos entre repos

### 22.4 Collaboration DNA
- SVG generativo tipo doble hélice basado en los valores del radar
- 5 trazas de color (una por eje), seed determinista del ID de la entidad
- Labels debajo con dots de color
- Huella visual única por entidad

**Archivos modificados**:
- `src/components/Universe/computeDetailData.worker.js` — las 4 features calculadas en el worker
- `src/components/Universe/UniverseView.jsx` — JSX de las 4 secciones
- `src/components/Universe/UniverseView.module.css` — CSS para `.detailDNA*`, `.detailMatrix*`, `.detailImpact*`, `.detailSimilar*`

---

## 23. Carga Progresiva en 2 Fases (Worker)

**Problema**: Tras añadir las 4 features, el Worker tardaba demasiado en responder porque calculaba TODO (incluido `similarEntities` O(n²)) antes de enviar datos. El usuario veía el spinner completo sin poder interactuar.

**Solución**: Dividir el Worker en **Phase 1** (instantánea) y **Phase 2** (pesada).

**Archivos modificados**:
- `src/components/Universe/computeDetailData.worker.js`:
  - `computeCoreData()` — **Phase 1**: stats, radar, health, analysis, network role, key deps, knowledge flows
  - `computeAdvancedData()` — **Phase 2**: impact simulation, collab matrix, similar entities, collab DNA
  - `self.postMessage({ phase: 1, data: core })` inmediato
  - `self.postMessage({ phase: 2, data: advanced })` cuando termina
- `src/components/Universe/UniverseView.jsx`:
  - `w.onmessage` maneja `phase === 1` (setDetailData, setDetailLoading false) y `phase === 2` (merge con spread `{ ...prev, ...data, _advancedLoaded: true }`)
  - **Skeleton shimmer** en las 4 secciones avanzadas mientras Phase 2 carga
  - Flag `_advancedLoaded` controla visibilidad de skeletons vs contenido real
- `src/components/Universe/UniverseView.module.css`:
  - `.detailSkeleton`: `height: 48px`, background sutil, `overflow: hidden`
  - `.detailSkeletonShimmer`: gradiente linear animado con `translateX(-100% → 100%)` a 1.5s
  - `@keyframes skeletonShimmer`

**Resultado**: El panel muestra info básica (~50ms), luego las features pesadas aparecen progresivamente (~200-500ms después) con shimmer transition. El usuario puede leer stats, radar y health mientras el resto carga.

---

## 24. UX del Panel — Tooltips Unificados

**Problema**: Los tooltips usaban `title=""` nativo del navegador (feo, inconsistente, sin estilo) excepto el radar que tenía un tooltip custom con blur y flechita.

**Solución**: Unificar TODOS los tooltips con el estilo del radar.

**Archivos modificados**:
- `src/components/Universe/UniverseView.jsx`:
  - 52 atributos `title=""` convertidos a `data-tip=""`
  - Eliminados `showTooltip`/`hideTooltip` callbacks
  - **Delegación de eventos global**: un `useEffect` con `document.addEventListener('mouseover'/'mouseout')` detecta cualquier `[data-tip]` y posiciona el `.floatingTooltip`
  - El tooltip se muestra con `getBoundingClientRect()`, centrado horizontalmente, 8px arriba
  - Delay de ocultación: 120ms
- `src/components/Universe/UniverseView.module.css`:
  - `.floatingTooltip`: `position: fixed`, `backdrop-filter: blur(16px)`, borde sutil, sombra, flechita `::after`, animación `tooltipFadeIn`

---

## 25. Panel — Scrollbar y Tamaño

**Problema**: El scrollbar del navegador se montaba encima del contenido del panel, y el panel era demasiado pequeño (900px) para las nuevas features.

**Solución**:
- `scrollbar-gutter: stable` en sidebar y main area — reserva espacio fijo para el scrollbar
- Panel ampliado de 900px a 1100px
- Sidebar de 280px a 320px
- Scrollbar customizado: 5px ancho, thumb semi-transparente con hover state
- `overflow-x: hidden` para prevenir scroll horizontal

**Archivos modificados**:
- `src/components/Universe/UniverseView.module.css`:
  - `.detailPanelExpanded`: width `min(1100px, calc(100vw - 60px))`, padding `22px 28px`
  - `.detailSidebar`: 320px, `scrollbar-gutter: stable`, `padding-right: 14px`
  - `.detailMain`: `scrollbar-gutter: stable`, `padding-right: 10px`
  - `::-webkit-scrollbar`: 5px, transparent track, thumb 0.1 opacity → 0.18 on hover

---

## 26. Health Score Gauge — Geometría SVG Corregida

**Problema**: El número del health score se solapaba con el arco semicircular. Múltiples intentos fallaron por no calcular correctamente la geometría del arco SVG.

**Análisis del fallo**: Un arco SVG `M x1 y1 A r r 0 0 1 x2 y2` con chord (x2-x1) y radio r tiene su punto más alto en `y_top = cy - r` donde `cy = y1 + √(r² - (chord/2)²)`. Con chord=80 y r=42, el tope del arco estaba a y≈38.8, exactamente donde estaba el texto.

**Solución final**: Diseño clásico de velocímetro con geometría verificada matemáticamente.

**Archivos modificados**:
- `src/components/Universe/UniverseView.jsx`:
  - viewBox `0 0 120 68`
  - Arco: `M 10 60 A 50 50 0 0 1 110 60` (r=50, chord=100, tope a y=10)
  - Número `{healthScore}` en `(60, 44)` — 34 unidades debajo del tope del arco
  - `/ 100` en `(60, 56)` — 4 unidades arriba de los endpoints
  - `strokeDasharray={healthScore * 1.57}` — longitud del semicírculo = π×50 ≈ 157
  - Color condicional: verde ≥70, amarillo ≥40, rojo <40
  - `strokeWidth="5"`, `strokeLinecap="round"`
- `src/components/Universe/UniverseView.module.css`:
  - Expandido: 170×96px
  - Compacto: 130×74px

---

## 27. Radiación de Hawking — Visibilidad y Forma

**Problema**: Las partículas de Hawking (micropartículas emanando de procesadores) eran invisibles: `size=0.08` (minúsculo), `opacity` máxima 0.3, y se renderizaban como cuadrados.

**Solución en 2 partes**:

### 27.1 Visibilidad
- Tamaño: `0.08` → `0.35` (×4.4)
- Brillo: `multiplyScalar(1.2)` → `2.0`
- Opacidad máxima: `0.3` → `0.7`
- Velocidad de fade-in: `0.3` → `0.4`
- Cantidad: 12 → 18 partículas por org

### 27.2 Forma circular
- Añadido `map={glowTex}` usando `createGlowTexture()` (ya existente en el proyecto)
- Textura radial 64×64 con gradiente blanco→transparente
- Con `AdditiveBlending` genera un halo suave circular

**Archivos modificados**:
- `src/components/Universe/UniverseView.jsx`:
  - `HawkingRadiation`: `const glowTex = useMemo(() => createGlowTexture(), [])`, `map={glowTex}` en `<pointsMaterial>`

---

## 28. Índices Inversos Globales en el Worker

**Problema**: El Worker usaba búsquedas lineales repetidas O(n²) y O(n³). Para cada usuario, iteraba TODOS los `repoUsers` con `.some()` para encontrar sus repos, y luego TODOS los `orgRepos` para sus orgs. En `similarEntities`, esto se repetía por cada usuario candidato, multiplicando la complejidad.

**Solución**: Función `buildIndices()` crea 5 índices O(1) una sola vez al inicio de `computeCoreData`, reutilizados en Phase 1 y Phase 2.

| Índice | Tipo | Reemplaza |
|--------|------|-----------|
| `userToRepos` | `Map<userId, repoId[]>` | Iterar todos los `repoUsers` con `.some()` |
| `repoUserIdSets` | `{repoId: Set<userId>}` | `.some(u => u.id === x)` → `.has(x)` O(1) |
| `repoToOrg` | `{repoId: orgId}` | Iterar `orgRepos` por cada repo |
| `repoNodeMap` | `Map<repoId, repo>` | `.find(r => r.id === x)` O(n) → `.get(x)` O(1) |
| `orgNodeMap` | `Map<orgId, org>` | `.find(o => o.id === x)` O(n) → `.get(x)` O(1) |

**Complejidad para un click en usuario**:
- **Antes**: O(R × U_per_repo) + O(R × O × R_per_org) ≈ millones de iteraciones
- **Ahora**: O(repos_per_user) + O(repos_per_user) ≈ decenas de iteraciones

**Archivos modificados**:
- `src/components/Universe/computeDetailData.worker.js`:
  - Nueva función `buildIndices(universeData)` al inicio
  - `_idx` pasado de Phase 1 a Phase 2 para evitar reconstrucción
  - Todas las secciones (orgs entrelazadas, cross-pollination, key dependencies, repo org diversity, user repos/orgs/co-contributors, impact simulation, similar entities) reescritas para usar los índices

---

## 29. Escala Logarítmica en Radar de Colaboración

**Problema**: Los ejes del radar saturaban trivialmente al 100%. Ej: un usuario con 5 orgs = 100% Org Span (`/5`), un repo con 20 contributors = 100% Alcance (`/20`), un usuario con 5 lenguajes = 100% Versatilidad (`/5`). El pentágono se convertía en un círculo perfecto para cualquier entidad medianamente activa, perdiendo completamente su valor analítico.

**Solución**: Escala logarítmica `log(1+val) / log(1+max)` que da resolución en valores bajos y comprime valores altos.

**Ejes actualizados**:

| Entidad | Eje | Antes | Ahora |
|---------|-----|-------|-------|
| **Org** | Puente | `bridgePct / 50` | `logScale(bridgePct, 80)` |
| **Org** | Influencia | `(users×repos) / 500` | `logScale(users×repos, 2000)` |
| **Repo** | Diversidad | `orgDiversity / 5` | `logScale(orgDiversity, 500)` (recalibrado §31) |
| **Repo** | Alcance | `users / 20` | `logScale(users, 80)` |
| **User** | Org Span | `orgs / 5` | `logScale(orgs, 15)` |
| **User** | Colaboración | `coContribs / 30` | `logScale(coContribs, 20000)` (recalibrado §31) |
| **User** | Versatilidad | `langs / 5` | `logScale(langs, 12)` |

Ejes que ya son porcentajes naturales (Centralidad `/100`, Conectividad `/100`, Diversidad de org, Puente de repo como ratio) no necesitan `logScale`.

**También actualizado en Phase 2**: `computeRadar()` dentro de `similarEntities` usa la misma `logScale` para mantener coherencia en la comparación de vectores.

**Archivos modificados**:
- `src/components/Universe/computeDetailData.worker.js`:
  - `logScale()` definida en `computeCoreData` y `computeAdvancedData`
  - 7 ejes de radar actualizados (Phase 1)
  - 3 vectores `computeRadar` actualizados (Phase 2)

---

## 30. ViewBox del Radar SVG Ampliado

**Problema**: El label "Versatilidad" (eje inferior-izquierdo del pentágono, i=4, ángulo ≈162°) se cortaba por la izquierda. Con `cosA ≈ -0.95`, el label se posicionaba en `lx ≈ 7` con `textAnchor='end'`, necesitando ~79px hacia la izquierda (12 chars × ~6.6px monospace 11). Llegaba a x ≈ -72 pero el viewBox empezaba en x = -50.

**Solución**: viewBox ampliado de `-50 -25 300 260` a `-80 -25 360 260`, dando 30px extra a cada lado.

**Archivos modificados**:
- `src/components/Universe/UniverseView.jsx`:
  - SVG del radar: `viewBox="-80 -25 360 260"`

---

## 31. Calibración de Escalas Logarítmicas con Datos Reales

**Problema**: Los `logMax` de la escala logarítmica (sección 29) se habían elegido a ojo sin datos reales. Un análisis exhaustivo con el `CollaborationNetworkAnalyzer` y los datos del endpoint `/collaboration/discover` reveló problemas severos:

| Eje | logMax anterior | Saturación real | Causa raíz |
|-----|----------------|-----------------|------------|
| **User Colaboración** | 150 | **76.4%** al 100% | Repos de Microsoft (~10000 collaborators c/u). p50 de co-contributors = 10076 |
| **Repo Diversidad** | 15 | **26.1%** ≥95% | p90 de orgs-diversidad = 141, max = 260 |

**Datos del dataset** (26064 users, 1122 repos, 701 orgs en el grafo):
- Co-contributors: p10=23, p25=146, **p50=10076**, p90=16795, max=17391
- Repo org-diversity: p50=3, p75=15, **p90=141**, max=260

**Solución**: Recalibración basada en distribuciones reales.

| Eje | logMax anterior | logMax nuevo | Efecto |
|-----|----------------|-------------|--------|
| **User Colaboración** | 150 | **20000** | p25=146→50%, p50=10076→93%, max→99% |
| **Repo Diversidad** | 15 | **500** | p50=3→22%, p75=15→45%, p90=141→80% |

**Ejes que NO necesitaron ajuste** (0% saturación):
- Org Span (logMax=15): p95=2, max=20
- Versatilidad (logMax=12): p95=6, max=9
- Repo Alcance (logMax=80): p95=51, max=10147 (3.8% saturación, aceptable)
- Org Puente/Influencia: distribución dentro de rango

**Coherencia validada**: Un usuario con 55% centralidad + alta colaboración ES coherente:
- Centralidad = percentil de # orgs distintas (mide alcance cross-org)
- Colaboración = logScale de # co-contributors (mide tamaño de red personal)
- Son conceptos independientes: contribuir a repos MUY populares de 2-3 orgs da pocas orgs (centralidad moderada) pero muchos co-contributors (colaboración alta)

**Methodology**: Script `scripts/_frontend_analysis.py` que llama al API, reconstruye los cálculos del worker exactamente, y computa percentiles/saturación.

**Archivos modificados**:
- `src/components/Universe/computeDetailData.worker.js`:
  - Phase 1: Colaboración `logScale(coContribs, 150)` → `logScale(coContribs, 20000)`
  - Phase 1: Diversidad repos `logScale(orgDiversity, 15)` → `logScale(orgDiversity, 500)`
  - Phase 2: `computeRadar()` para similarEntities actualizado con mismos logMax

---

## 32. Caché Chunked para Grafo >2MB + GZip + Persistencia Network Metrics

**Problema**: El grafo de colaboración (~22 MB JSON, 27887 nodos, 98557 links) no se podía guardar en un solo documento de MongoDB. Cosmos DB vCore tiene un límite de 2 MB por documento, y MongoDB local 16 MB. El `replace_one` fallaba silenciosamente y cada carga del Universe View requerida recomputar todo (~7s).

**Datos reales del grafo vs MongoDB**:
- MongoDB: 1646 repos, 28073 users, 468 orgs
- Grafo: 1122 repos, 26064 users, 701 orgs
- **Diferencia de repos** (1646→1122): Solo repos conectados por bridge users entran al grafo. Un repo con 1 solo contributor que no trabaja en otro repo no tiene bridge → excluido.
- **Diferencia de users** (28073→26064): Solo usuarios que aparecen como collaborators en repos del grafo.
- **Diferencia de orgs** (468→701): Los nodos org se crean desde `repo.owner.login`, no desde la colección `organizations`. Muchos owners son orgs sin documento propio en MongoDB → MÁS orgs en el grafo que en la BD.

### Solución A: Caché Chunked (`src/core/chunked_cache.py`)

Módulo genérico que divide arrays grandes en chunks de ~1.5 MB:

```python
save_chunked(collection, "collaboration_graph", result,
             large_fields=["graph.nodes", "graph.links", "bridge_users"])

loaded = load_chunked(collection, "collaboration_graph")  # reensambla automáticamente

delete_chunked(collection, "collaboration_graph")  # borra meta + todos los chunks
```

| Función | Descripción |
|---------|-------------|
| `save_chunked()` | Estima tamaño por item (sampling 50), divide en chunks <1.5MB, guarda cada chunk como doc independiente con `_id: "base##field_path##index"` |
| `load_chunked()` | Lee meta doc → lee chunks por field → reensambla arrays originales. Compatible con docs legacy (sin chunks). |
| `delete_chunked()` | Lee chunk_map del meta → elimina todos los chunks + meta en batch |
| `get_cache_age_seconds()` | Retorna antigüedad del caché en segundos |

Para el grafo real: 1 meta doc + 2 chunks de nodos + 6 chunks de links + 1 chunk de bridge_users ≈ **10 documentos**, todos bajo 2 MB.

### Solución B: GZip Middleware

`GZipMiddleware(minimum_size=1000)` en FastAPI comprime respuestas >1KB. Para el grafo de 22 MB, la respuesta se comprime a ~2-3 MB en tránsito.

### Solución C: orjson para Discover

El endpoint `/collaboration/discover` ahora serializa con `orjson.dumps()` (~10× más rápido que `json.dumps`).

### Solución D: Persistencia de Network Metrics en MongoDB

El endpoint `/collaboration/network-metrics` ahora tiene 3 niveles de caché:
1. **Memoria** (más rápido, 1h TTL, se pierde con restart)
2. **MongoDB chunked** (persistente, 1h TTL, sobrevive restarts)
3. **Recomputación** (último recurso, ~30-90s con NetworkX)

Antes, cada restart del servidor requería ~90s de recomputación. Ahora carga desde MongoDB en <1s.

### Solución E: Botón Refresh Invalida Todo

`POST /dashboard/refresh-metrics` ahora también:
- Invalida caché chunked del grafo de colaboración
- Invalida caché chunked de network metrics
- Limpia caché en memoria de network metrics

El frontend propaga `forceRefresh` a `discoverCollaboration(true)` para recomputar con datos frescos.

**Rendimiento medido**:
| Escenario | Antes | Después |
|-----------|-------|---------|
| Discover (recomputar) | 7.15s | 7.15s (igual, es I/O bound) |
| Discover (desde caché) | 7.15s (sin caché, recomputaba siempre) | **3.26s** (chunked + gzip) |
| Network metrics (restart) | ~90s (recomputar) | **<1s** (MongoDB chunked) |

**Archivos creados/modificados**:
- `Backend/src/core/chunked_cache.py` — **Nuevo**: módulo de caché chunked genérico
- `Backend/src/api/main.py` — +GZipMiddleware
- `Backend/src/api/routes.py` — discover usa chunked cache + orjson, network-metrics persiste a MongoDB, refresh invalida todo
- `Frontend/src/services/api.js` — `discoverCollaboration(forceRefresh)` con `?force=true` + timeout 2min
- `Frontend/src/store/dashboardStore.js` — propaga `forceRefresh` a discover

---

## Resumen de Archivos Afectados

| Archivo | Tipo de cambio |
|---------|---------------|
| `src/components/Universe/computeLayout.worker.js` | **Nuevo** - Web Worker layout, Jenks Natural Breaks, mapeo log continuo, fronteras data-driven |
| `src/components/Universe/computeDetailData.worker.js` | **Nuevo** - Web Worker panel (2 fases), índices globales, escala logarítmica, logMax calibrados, rol "Nodo Especializado", clasificación 7 niveles |
| `src/components/Universe/UniverseView.jsx` | Modificado - Worker, Canvas defer, loader SVG, montaje progresivo, shaders GPU, bridge reveal, efectos gating, panel expandido, 4 features, tooltips, health gauge, Hawking, carga progresiva, viewBox radar, rediseño header/leyenda/métricas, help panel 5 tabs, drag vs click, guardedSelect, Jenks inline |
| `src/components/Universe/UniverseView.module.css` | Modificado - Panel layout, scrollbar, skeletons, tooltips, health SVG, DNA/matrix/impact/similar CSS, headerTag, headerDividerV, legendCard, metricValue2, helpPanel/helpTabs/helpTabBtn, hintDivider |
| `src/services/api.js` | Modificado - `discoverCollaboration(forceRefresh)` con `?force=true` y timeout 2min |
| `src/store/dashboardStore.js` | Modificado - Propaga `forceRefresh` a `discoverCollaboration`, `refreshMetrics()` invalida cachés antes de recargar |
| `src/App.jsx` | Modificado - Loading screen, posición del banner |
| `src/App.module.css` | Modificado - Draw-on SVG, layout fijo, timing |
| `src/components/Dashboard/CollaborationBanner.jsx` | **Reescrito** - Portal cuántico |
| `src/components/Dashboard/CollaborationBanner.module.css` | **Reescrito** - Estilos del portal |

---

## Principios Aplicados

- **Animaciones en compositor**: Solo `transform` y `opacity` para que se ejecuten en GPU sin depender del hilo principal
- **Sin timers JS para animaciones**: CSS puro (`animation-delay`, keyframes) en vez de `setInterval`/`setTimeout` para loops visuales
- **Pointer-events selectivos**: Nunca `pointer-events: auto` en capas de viewport completo
- **Layout estable**: Contenedores con dimensiones fijas para evitar CLS (Cumulative Layout Shift)
- **IntersectionObserver**: Reveal on scroll para coherencia visual con el resto del dashboard
- **Campos de API verificados**: Usar nombres de campo reales del backend, no asumir convenciones
- **useRef para animación**: Escribir progreso directamente al ref en `useFrame` — cero re-renders React desde el bucle de render
- **GPU clip-space culling**: Mover vértices a `vec4(9999,9999,9999,1)` cuando deben ser invisibles — bypasses the GPU's minimum `gl_PointSize` clamping
- **Early returns en useFrame**: Saltar loops pesados cuando el progreso es 0 — ahorra 15-50ms/frame con 1.33M iteraciones
- **Montaje progresivo con yields**: Chunks pequeños + `yieldToMain()` para evitar "página no responde"
- **Staggering per-elemento**: Seeds pseudo-aleatorios en shaders GLSL para materialización progresiva vs flash simultáneo
- **Narrativa visual coherente**: Bridges se "descubren" durante entanglement, no aparecen pre-etiquetados
- **Carga progresiva en workers**: Phase 1 (core data, ~50ms) + Phase 2 (heavy features, ~200-500ms) con skeleton shimmer entre fases
- **Delegación de eventos para tooltips**: Un solo listener global vs N handlers individuales — menor overhead de memoria y render
- **Geometría SVG verificada matemáticamente**: Calcular `y_top = cy - r` donde `cy = y + √(r² - (chord/2)²)` antes de posicionar texto
- **scrollbar-gutter: stable**: Reserva espacio fijo para scrollbar, previniendo CLS al aparecer/desaparecer contenido
- **Índices inversos pre-computados**: `buildIndices()` una vez O(n) → millones de lookups O(1) en vez de búsquedas lineales repetidas
- **Escala logarítmica para normalización**: `log(1+val)/log(1+max)` evita saturación trivial en métricas con distribución desigual
- **Calibración data-driven de escalas**: Analizar distribuciones reales (percentiles, saturación) antes de fijar logMax — evita ejes inútiles donde todos muestran 100%
- **Caché chunked para documentos grandes**: Dividir arrays en chunks de ≤1.5 MB permite cachear datos de cualquier tamaño en MongoDB/Cosmos DB vCore respetando el límite de 2 MB por documento
- **GZip en API**: `GZipMiddleware` comprime respuestas JSON grandes (22 MB → ~2-3 MB) sin cambios en el frontend
- **Caché multi-nivel**: Memoria (rápido, volátil) + MongoDB (persistente, sobrevive restarts) + recomputación (último recurso)
- **Caché permanente sin TTL**: Los datos en `metrics` persisten hasta invalidación explícita - una app desplegada en la nube sirve siempre desde caché
- **Invalidación centralizada**: `invalidate_all_caches()` elimina todos los cachés (chunked, document, in-memory) con una sola llamada
- **Invalidación automática post-ingesta**: Cada tarea de ingesta/enriquecimiento invalida cachés al completarse - la siguiente carga recalcula datos frescos
- **InstancedMesh para escenas masivas**: Consolidar miles de meshes idénticos en 1 draw call con matrices de transformación per-instance
- **GLSL shaders para animación**: Mover toda animación repetitiva (jitter, orbitas, ondas, fade) a vertex/fragment shaders - CPU → GPU transfer
- **Drag vs click con DOM nativo**: Trackear desplazamiento en `gl.domElement` (no en eventos R3F) para capturar movimiento sobre espacio vacío
- **Semántica de rol vs posición**: Los roles de red (Hub, Bridge, Local, Specialist) deben reflejar métricas, no posición espacial en el layout
- **Paneles con tabs para documentación extensa**: Organizar >30 items en tabs categorizadas con navegación por iconos, responsive
- **Valores absolutos sobre percentiles**: Las métricas de posicionamiento usan valores raw (suma de contributors compartidos), no percentiles que comprimen distribuciones power-law a escalas uniformes
- **Fronteras data-driven (Jenks Natural Breaks)**: Las zonas del universo (core/mid/peripheral) se determinan con el algoritmo Fisher-Jenks (1958) que minimiza varianza intra-clase (SDCM) — cero constantes arbitrarias, GVF=0.9050
- **Validación con datos reales**: Cada decisión de clasificación se verifica contra la distribución real del dataset con scripts dedicados — nunca ajustar parámetros sin evidencia empírica
- **Clasificación granular de roles de red**: 7 niveles con umbrales estrictos (pct ≥ 85 para Hub Central, top ~15%) en vez de umbrales laxos (>50) que clasificarían a la mitad como hubs
- **Pre-cómputo antes de clasificación**: Calcular todos los targetR antes de ejecutar Jenks, no durante el placement — permite que el algoritmo vea la distribución completa

---

## 33. Estrategia de Caché Permanente y Sistema de Invalidación Centralizado

**Problema**: Las cachés tenían TTL de 1 hora, lo que provocaba recálculos innecesarios cada hora incluso sin cambios en los datos. Además, no todos los endpoints estaban cacheados y no existía una forma centralizada de invalidar todas las cachés cuando los datos cambiaban (ingesta/enriquecimiento).

**Requisitos del usuario**:
1. **Sin TTL**: Las cachés deben persistir indefinidamente hasta invalidación explícita
2. **Botón Actualizar**: Debe invalidar TODO y recargar datos frescos
3. **Post-ingesta/enriquecimiento**: Invalidar cachés automáticamente al completar procesos
4. **Cloud-first**: El usuario en producción nunca debería ver un estado sin caché

**Solución implementada**:

### A. Eliminación de TTLs (cachés permanentes)

**`/dashboard/stats`**: Eliminado `CACHE_TTL_HOURS = 1` y la comprobación `age_hours < CACHE_TTL_HOURS`. Ahora sirve desde caché siempre que exista, sin importar antigüedad.

**`/collaboration/network-metrics`**: Eliminado `timedelta(hours=1)` en caché en memoria y `age_seconds < 3600` en caché MongoDB. Ambos niveles sirven datos permanentemente.

**Bug corregido**: `has_filters` siempre era True porque `not include_bots` (default False) evaluaba a True. Corregido a `bool(org or language or repo or collab_type or include_bots)` — ahora el default sin filtros usa caché correctamente.

### B. Caché permanente en `/stats`

El endpoint `/stats` (conteos simples) ahora escribe un documento `{type: "simple_counts"}` en la colección `metrics`. Las siguientes peticiones se sirven directamente desde este documento sin ejecutar `count_documents`.

### C. Función `invalidate_all_caches()`

Nueva función centralizada en `routes.py` que elimina TODAS las cachés de la aplicación:
- `collaboration_graph` (chunked, ~25 documentos)
- `network_metrics` (chunked, ~8 documentos)  
- `_network_metrics_cache` (in-memory: json_bytes, computed_at, analyzer)
- `dashboard_stats` (documento simple en metrics)
- `simple_counts` (documento simple en metrics)

### D. Endpoint `POST /dashboard/refresh-metrics` simplificado

Antes: invalidaba 3 cachés manualmente + recalculaba stats.
Ahora: llama `invalidate_all_caches()` y retorna `{invalidated: True, details: {...}}`.
El frontend se encarga de recargar datos frescos con `loadFullData(true)`.

### E. Invalidación automática post-ingesta/enriquecimiento

Las 6 funciones `_run_*` + 2 funciones de pipeline ahora llaman `invalidate_all_caches()` al completarse exitosamente:
- `_run_repository_ingestion`
- `_run_user_ingestion`
- `_run_repository_enrichment`
- `_run_user_enrichment`
- `_run_organization_ingestion`
- `_run_organization_enrichment`
- `_run_full_pipeline_direct`
- `_run_full_pipeline_script`

Cada invalidación está envuelta en try/except para que un error de caché no marque la tarea como fallida.

### F. Frontend: flujo de actualización mejorado

`dashboardStore.refreshMetrics()` ahora:
1. Llama `POST /dashboard/refresh-metrics` → invalida TODAS las cachés del backend
2. Llama `loadFullData(true)` → recalcula `dashboard/stats` + `discover` (con `force=true`)
3. Network metrics se recalculará la próxima vez que el usuario acceda al Universe

**Archivos modificados**:
- `Backend/src/api/routes.py` — `invalidate_all_caches()`, sin TTL en 3 endpoints, `/stats` con caché, hooks en 8 funciones background
- `Frontend/src/store/dashboardStore.js` — `refreshMetrics()` llama POST invalidar antes de recargar
- `Frontend/src/services/api.js` — `refreshDashboardMetrics()` ya existía y se reutiliza

**Resultado verificado**:
- `/stats` 1ª llamada: 2928ms (computa) → 2ª llamada: desde caché permanente
- `/dashboard/stats` 1ª llamada: computa → 2ª llamada: `cached=True` permanente
- `POST /dashboard/refresh-metrics`: invalida 25+8+1+1 documentos de caché
- Tras invalidación: siguiente GET recomputa y guarda en caché nuevamente

---

## 34. Caché Completa del Universo Cuántico y Análisis de Colaboración

**Problema**: Los endpoints que usa directamente el Universe View (panel de detalle, tunneling, análisis por usuario) NO estaban cacheados. Cada click en un nodo del universo o cada uso de Quantum Tunneling disparaba queries pesados a MongoDB desde cero.

**Endpoints afectados**:

| Endpoint | Antes | Después |
|----------|-------|---------|
| `POST /collaboration/analyze` | Sin caché — N queries a MongoDB por cada interacción | Caché permanente por parámetro (usuario, repos hash, orgs hash) |
| `GET /collaboration/user/{login}` | Sin caché — delegaba a analyze sin cachear | Hereda caché de analyze (misma clave `collab_analysis_user_{login}`) |
| `GET /collaboration/quantum-tunneling` | Solo in-memory — tras restart, reconstruía grafo ~90s | Intenta restaurar analyzer desde caché MongoDB chunked antes de reconstruir desde raw |

### A. Caché permanente en `/collaboration/analyze`

Cada modo (user_focus, repos_comparison, orgs_comparison) genera una clave única:
- `collab_analysis_user_{login}` — para modo usuario
- `collab_analysis_repos_{md5(repos)}` — para modo repos (hash MD5 de repos ordenados)
- `collab_analysis_orgs_{md5(orgs)}` — para modo orgs (hash MD5 de orgs ordenadas)

El resultado se guarda como documento simple en `metrics` (tamaño moderado, <2MB). Se sirve instantáneamente en llamadas posteriores.

### B. Quantum Tunneling con fallback a caché MongoDB

Antes: si `_network_metrics_cache["analyzer"]` era None (restart), reconstruía el grafo NetworkX completo desde las 3 colecciones raw (~90s).

Ahora: intenta primero verificar si existe caché chunked de `network_metrics` en MongoDB. Si existe, reconstruye el analyzer (aún necesita build_from_mongodb pero al menos confirma que hay datos). Si no, construye desde cero. En ambos casos guarda el analyzer en memoria para futuros requests.

### C. `invalidate_all_caches()` actualizado

Ahora también limpia los análisis cacheados:
```python
metrics.delete_many({"_id": {"$regex": "^collab_analysis_"}})
```

Resultado de invalidación completa verificado:
```json
{
  "collaboration_graph_chunks": 25,
  "network_metrics_chunks": 8,
  "dashboard_stats": 1,
  "simple_counts": 0,
  "collaboration_analyses": 1
}
```

### D. Bug corregido: `has_filters` en `/dashboard/stats`

`has_filters = bool(org or language or repo or collab_type or not include_bots)` siempre era True porque `include_bots=False` (default) → `not False = True`. Corregido a `bool(... or include_bots)`. Esto impedía que el dashboard sin filtros usara caché.

**Resultado**: Ahora TODOS los endpoints computacionalmente relevantes están cacheados permanentemente:

| Endpoint | Tipo caché | Invalidación |
|----------|-----------|-------------|
| `/stats` | MongoDB doc | `invalidate_all_caches()` |
| `/dashboard/stats` | MongoDB doc | `invalidate_all_caches()` |
| `/collaboration/discover` | MongoDB chunked | `invalidate_all_caches()` |
| `/collaboration/network-metrics` | Memoria + MongoDB chunked | `invalidate_all_caches()` |
| `/collaboration/analyze` | MongoDB doc por params | `invalidate_all_caches()` |
| `/collaboration/user/{login}` | Hereda de analyze | `invalidate_all_caches()` |
| `/collaboration/quantum-tunneling` | Memoria (analyzer) | `invalidate_all_caches()` |

---

## 35. Optimización 3D Integral - De 1.36M a ~700 iteraciones CPU/frame

**Problema**: El render loop (`useFrame`) ejecutaba **1.36 millones de iteraciones CPU por frame**, resultando en ~3,500 draw calls y ~16 MB de GPU uploads continuos. Todo ello provocaba caídas de framerate severas incluso en hardware potente.

**Solución**: 11 optimizaciones independientes aplicadas a todos los subsistemas 3D del universo:

### 35.1 QuantumProcessors - InstancedMesh (700 orgs × 4 meshes = 2800 draw calls → 4)
- 3 `<instancedMesh>` para torus1, torus2 y core (1 draw call cada uno)
- 1 `<instancedMesh>` invisible para hitbox (interacción)
- Matrices de transformación escritas una vez en `useEffect`, rotaciones por `useFrame` solo actualizan las matrices de los torus
- Color individual vía `instanceColor`

### 35.2 ProbabilityClouds - GPU orbital shader (11K iter/frame → 0)
- Partículas orbitales alrededor de repos movidas 100% a vertex shader GLSL
- `aAngle`, `aRadius`, `aSpeed`, `aPhaseY` como atributos por vértice
- `useFrame` solo actualiza `uTime` (1 uniform)

### 35.3 Qubits - InstancedMesh (1122 draw calls → 1)
- Todas las esferas repo en un solo `<instancedMesh>`
- Heisenberg jitter (micro-vibración) calculada en `useFrame` con escritura directa a matrices

### 35.4 BlochAxes - Per-instance GPU (1122 LineSegments → 1 instanced)
- Segmentos de línea para ejes |0⟩↔|1⟩ consolidados en un único `<lineSegments>` con buffer de posiciones

### 35.5 QuantumParticles - 100% GPU ShaderMaterial (27K+ usuarios)
- `ShaderMaterial` custom con vertex + fragment shaders GLSL
- Jitter Heisenberg, bridge reveal (verde → dorado), lens coloración, density - todo en GPU
- `useFrame` solo actualiza 2 uniforms: `uTime` y `uBridgeReveal`
- Bridge reveal driven by `entanglement` progress con stagger individual por partícula

### 35.6 QuantumBonds - Espiral animada 100% GPU
- Conexiones `contributed_to` como espirales helicoidales
- Geometría generada una vez (35 puntos × N conexiones), animación de rotación + opacidad en vertex shader
- `useFrame` actualiza solo 3 uniforms

### 35.7 EntanglementArcs - Curvas cuadráticas GPU
- Arcos org↔org como `<line2>` con `LineMaterial`
- Geometría estática, animación de opacidad y desplazamiento en shader

### 35.8 EntanglementChannels - Ondas sinusoidales GPU
- 38K conexiones × 35 puntos = 1.33M posiciones pre-computadas en `useMemo`
- Animación de onda senoidal 100% en vertex shader con `sin()`
- Early return: `if (progress < 0.01) return` salta 1.33M iteraciones los primeros 6.5s

### 35.9 EnergyRings - InstancedMesh (700 draw calls → 1)
- Anillos de energía alrededor de procesadores consolidados en 1 `<instancedMesh>`
- Rotación y escala animadas en `useFrame` con escritura directa a matrices

### 35.10 InterferencePattern - GPU shader (600 iter/frame → 0)
- Patrón de interferencia ondulante con vertex shader que calcula desplazamiento sinusoidal
- Solo 1 uniform `uTime` actualizado por frame

### 35.11 HawkingRadiation - GPU shader (12.6K iter/frame → 0)
- Partículas emanando de procesadores con vertex + fragment shaders
- Posición, velocidad, fade-in/out, respawn - todo en GLSL
- 1 uniform `uTime` por frame

**Resultado total**:

| Métrica | Antes | Después | Reducción |
|---------|-------|---------|-----------|
| CPU iter/frame | ~1,360,000 | ~700 | 99.95% |
| Draw calls | ~3,500 | ~10 | 99.7% |
| GPU upload/frame | ~16 MB | 0 (buffers estáticos) | 100% |

**Archivos modificados**:
- `src/components/Universe/UniverseView.jsx` - Todos los componentes 3D reescritos con InstancedMesh y GLSL shaders

---

## 36. Bloqueo de Interacciones Durante Animación + Fade del UI

**Problema**: Durante la animación de Big Bang (8.5s), el usuario podía hacer click en entidades causando selecciones prematuras con datos parciales. Además, los controles del UI aparecían inmediatamente sobre la animación, compitiendo visualmente.

### 36.1 Guard de selección durante animación

**Solución**: `guardedSelect` wrapper que bloquea clicks mientras la animación no ha completado:

```javascript
const guardedSelect = useCallback((entity, pos) => {
  if (bpRef.current.entanglement < 1.0) return  // animación no completada
  onSelect(entity, pos)
}, [onSelect])
```

Pasado como `onClick` a los 3 componentes interactivos: `QuantumProcessors`, `Qubits`, `QuantumParticles`.

`handleHover` también incluye guard equivalente para evitar tooltips prematuros.

### 36.2 Fade del UI tras animación completa

- Delay de 8500ms (`setTimeout`) antes de activar `uiVisible = true`
- Transición CSS de 1.8s con `opacity` y `translateY(8px)` → `translateY(0)`
- Clase `.universeUIVisible` aplicada condicionalmente

**Archivos modificados**:
- `src/components/Universe/UniverseView.jsx` - `guardedSelect`, `handleHover` guard, `uiVisible` state + timeout
- `src/components/Universe/UniverseView.module.css` - `.universeUI` con `opacity: 0` y `.universeUIVisible` con transición

---

## 37. Rediseño Visual Completo del UI del Universo

**Problema**: El UI del universo tenía un estilo funcional pero genérico. Los controles, leyenda, métricas y encabezado necesitaban un rediseño más profesional acorde al tema cuántico.

### 37.1 Header - Separación de marca con gradient

- **Átomo** `⚛` como icono de marca
- **"ENTANGLE"** como título principal con gradiente `linear-gradient(135deg, #00f7ff, #a855f7)` y `-webkit-background-clip: text`
- **"Quantum Field"** como tag con borde sutil de glassmorphism, font-size 9px uppercase
- **Divisor vertical** (`.headerDividerV`) de 1px con gradiente vertical cyan → transparente
- **Subtítulo** "Grafo de colaboración cuántica" en gris neutro

### 37.2 Leyenda - Glassmorphism card

- Envuelta en `.legendCard` con `backdrop-filter: blur(16px)`, borde sutil `rgba(255,255,255,0.06)`, border-radius 14px
- Cada item tiene un **type label** (`.legendType`) con el tipo de entidad (Org, Repo, User, Bridge, Collab) en uppercase 8px

### 37.3 Métricas - Jerarquía valor/etiqueta

- **Valor** (`.metricValue2`): font-family JetBrains Mono, font-weight 700, font-size 15px, color blanco
- **Etiqueta** (`.metricLabel2`): uppercase, font-size 8px, letter-spacing 0.5px, color gris `rgba(255,255,255,0.35)`
- Separación visual clara entre número y descripción

### 37.4 Hint de interacción - Layout flex con divisores

- Divisores estilizados (`.hintDivider`) con `|` en color `rgba(255,255,255,0.15)`
- Layout flex con gap uniforme

**Archivos modificados**:
- `src/components/Universe/UniverseView.jsx` - JSX del header, leyenda, métricas, hint
- `src/components/Universe/UniverseView.module.css` - `.headerBrand`, `.headerTag`, `.headerDividerV`, `.headerTitleGroup`, `.legendCard`, `.legendType`, `.metricValue2`, `.metricLabel2`, `.hintDivider`

---

## 38. Panel de Ayuda Completo con 5 Tabs

**Problema**: El panel de ayuda era un simple bloque de texto sin estructura. Con las ~40 entidades, fenómenos, métricas y controles del universo, el usuario necesitaba una guía organizada y navegable.

**Solución**: Panel expandido a 560px de ancho con 5 tabs de navegación y 38+ tarjetas descriptivas.

### Estructura

| Tab | Icon | Cards | Contenido |
|-----|------|-------|-----------|
| **Entidades** | ◉ | 5 | Procesadores (orgs), Qubits (repos), Partículas (users), Entrelazamiento (bridges), Canales (colaboraciones) |
| **Fenómenos** | ∿ | 9 | Big Bang, Vacío cuántico, Nubes de probabilidad, Ejes de Bloch, Anillos de energía, Ondas de decoherencia, Radiación Hawking, Tunneling, Interferencia |
| **Análisis** | ⬡ | 11 | Centralidad, Conectividad, Comunidades, Bus Factor, Radar de colaboración, Health Score, Network Role, Key Dependencies, Cross-pollination, Knowledge Flows, ADN de colaboración |
| **Lentes** | ◎ | 5 | Default, Centralidad, Comunidades, Actividad, Bridge |
| **Controles** | ⌘ | 8 | Rotación, Zoom, Click, Búsqueda, Tunneling, Ajustes, Filtros, Panel de detalle |

### Diseño

- **Header del panel**: icono `⚛` + título "Guía del Universo Cuántico" + subtítulo + botón cerrar
- **Tabs**: botones con iconos, efecto active con borde inferior cyan, transiciones suaves
- **Cards**: icono con fondo temático + título con tag de tipo + párrafo descriptivo
- **Help body**: scroll con scrollbar custom, animación `fadeIn` al cambiar de tab
- **Responsive**: en `<900px` se comprime a ancho completo, tabs muestran solo iconos

**State**: `const [helpTab, setHelpTab] = useState('entities')` controla la tab activa.

**Archivos modificados**:
- `src/components/Universe/UniverseView.jsx` - ~400 líneas de JSX con las 5 tabs y 38+ cards
- `src/components/Universe/UniverseView.module.css` - `.helpPanel` (560px), `.helpTabs`, `.helpTabBtn`, `.helpTabActive`, `.helpTabIcon`, `.helpSection`, `.helpCard`, `.helpCardTag`, `.helpControlGrid`, `.helpControlCard`, `.helpControlKey`, `.helpBody` con scrollbar, `@keyframes fadeIn`, responsive overrides

---

## 39. Detección Drag vs Click - Prevención de Selecciones Accidentales

**Problema**: Al rotar el universo (click + arrastrar con OrbitControls), R3F disparaba eventos `onClick` en las entidades 3D incluso después de arrastrar, causando selecciones accidentales constantes al intentar simplemente rotar la cámara.

**Causa raíz**: R3F ejecuta `onClick` tras `onPointerUp` sin distinguir si hubo desplazamiento. Un click-and-drag de 100px se registraba igual que un click puntual.

**Solución**: Tracking nativo de desplazamiento del puntero en el canvas DOM:

```javascript
const pointerDownPos = useRef({ x: 0, y: 0, dragged: false })
const { gl } = useThree()

useEffect(() => {
  const dom = gl.domElement
  const onDown = (e) => {
    pointerDownPos.current = { x: e.clientX, y: e.clientY, dragged: false }
  }
  const onMove = (e) => {
    const dp = pointerDownPos.current
    const dx = e.clientX - dp.x, dy = e.clientY - dp.y
    if (dx * dx + dy * dy > 25) dp.dragged = true  // > 5px = drag
  }
  dom.addEventListener('pointerdown', onDown)
  dom.addEventListener('pointermove', onMove)
  return () => {
    dom.removeEventListener('pointerdown', onDown)
    dom.removeEventListener('pointermove', onMove)
  }
}, [gl])
```

**Guard actualizado**:
```javascript
const guardedSelect = useCallback((entity, pos) => {
  if (bpRef.current.entanglement < 1.0) return  // animación
  if (pointerDownPos.current.dragged) return       // drag (rotación)
  onSelect(entity, pos)
}, [onSelect])
```

**Detalles técnicos**:
- **Threshold**: 5px (25 en distancia²) - lo suficientemente pequeño para no interferir con clicks intencionales, lo suficientemente grande para detectar cualquier gesto de rotación
- **Por qué DOM nativo**: Los eventos R3F (`onPointerDown`, `onPointerMove`) solo se disparan sobre objetos 3D que interceptan el raycast. Arrastrando sobre espacio vacío no genera eventos R3F, así que no podríamos detectar el drag. Usando `gl.domElement` (canvas DOM vía `useThree()`), capturamos TODOS los movimientos del puntero
- **Reset automático**: cada `pointerdown` resetea `dragged: false` - sin necesidad de limpiar en `pointerup`

**Archivos modificados**:
- `src/components/Universe/UniverseView.jsx`:
  - `pointerDownPos` ref (línea ~2468)
  - `useEffect` con listeners DOM en `gl.domElement` (líneas ~2472-2483)
  - `guardedSelect` con check `dragged` (línea ~2560)

---

## 40. Limpieza de Caracteres Em Dash y Corrección de Rol de Red

### 40.1 Eliminación de em dashes (`—` → `-`)

**Problema**: El carácter Unicode em dash (U+2014, `—`) se usaba inconsistentemente en comentarios y textos de UI. Aunque no afecta funcionalidad, genera inconsistencia visual y potenciales problemas de encoding.

**Solución**: Reemplazo masivo de `—` → `-` en los 23 archivos afectados:

| Tipo | Archivos |
|------|----------|
| **Python** | `network_metrics.py`, `routes.py` |
| **JSX** | `UniverseView.jsx`, `App.jsx`, `CollaborationBanner.jsx`, `BlochSphere.jsx`, `QuantumDivider.jsx`, `WavefunctionCollapse.jsx`, `EntanglementLines.jsx`, `QuantumBackground.jsx`, `ChartsSection.jsx`, `NetworkGraph.jsx` |
| **JS** | `computeDetailData.worker.js`, `computeLayout.worker.js`, `api.js` |
| **CSS** | `UniverseView.module.css`, `App.module.css`, `CollaborationBanner.module.css`, `WavefunctionCollapse.module.css`, `QuantumDivider.module.css`, `DetailTable.module.css`, `BlochSphere.module.css`, `ChartsSection.module.css` |

Solo comentarios y strings de UI afectados. Ningún operador ni lógica modificada.

### 40.2 Corrección del rol "Periférico" → "Nodo Especializado"

**Problema**: La clasificación de red asignaba el label "Periférico - En la periferia de la red" a entidades con baja centralidad Y baja conectividad. Esto generaba confusión semántica: una organización en la **zona mid** (segundo anillo, colaboración moderada) podía mostrarse como "Periférico", dando a entender que estaba aislada cuando en realidad tiene actividad.

"Periférico" implica posición espacial (zona aislada, tercer anillo). El rol de red mide **métricas de centralidad/conectividad**, no ubicación en el layout.

**Solución**: Renombrado del rol para reflejar su significado real:

| | Antes | Después |
|---|-------|---------|
| **Key** | `peripheral` | `specialist` |
| **Label** | Periférico | Nodo Especializado |
| **Icon** | `·` | `◇` |
| **Descripción** | En la periferia de la red - potencial de integración | Actividad concentrada en su nicho - potencial de mayor integración |

El color (`#a29bfe`) se mantiene.

**Archivo modificado**:
- `src/components/Universe/computeDetailData.worker.js` - Línea 349, clasificación `else` del NETWORK ROLE

---

## 41. Corrección de la Métrica de Posicionamiento de Organizaciones

**Problema**: Las organizaciones se posicionaban en el universo 3D utilizando `collab_centrality` (percentil 0-100), en lugar de `collab_centrality_raw` (suma real de contributors compartidos entre organizaciones). El percentil comprime una distribución power-law a una escala uniforme, distorsionando gravemente la representación espacial.

**Causa raíz**: El percentil rank se calcula como la posición relativa entre valores **únicos**. Si 1224 orgs tienen 127 valores distintos de raw>0, los percentiles se distribuyen uniformemente en [0,100]. Una org con raw=48 (rank 48/1224) obtiene percentil ~41, lo cual parece bajo, pero una org con raw=113 (rank 16/1224) obtiene percentil ~78. La diferencia real entre ambas (113 vs 48, ratio 2.35×) se comprime a un delta de percentil de 37 puntos.

**Consecuencia directa**: Con el umbral anterior `>= 40` para clasificar como "core", el ~60% de las orgs con cualquier actividad entraban en el core. Organizaciones como `sebastienrousseau` (raw=48, actividad moderada) aparecían junto a `Qiskit` (raw=486, el hub más grande del ecosistema).

**Solución**: Cambio de `collab_centrality` (percentil) a `collab_centrality_raw` (valor absoluto). Este valor representa la suma real de contributors compartidos con otras organizaciones, preservando la distribución power-law natural del ecosistema de software cuántico.

**Datos reales verificados con MongoDB**:
| Organización | `collab_centrality_raw` | Percentil | Rank |
|---|---|---|---|
| Qiskit | 486 | 100 | 1/1224 |
| qiskit-community | 354 | 98 | 2/1224 |
| PennyLaneAI | 312 | 97 | 3/1224 |
| Microsoft | 113 | 78 | 16/1224 |
| NVIDIA | 115 | 80 | 15/1224 |
| sebastienrousseau | 48 | 41 | 48/1224 |

**Distribución del dataset** (n=127 orgs con raw>0 de 1224 totales):
- min=1, max=486, mediana=16, media=48.6, p75=53, p90=131

**Archivos modificados**:
- `src/components/Universe/computeLayout.worker.js` — Fase 2: `orgScore[org.id] = nodeMetrics[org.id]?.collab_centrality_raw`
- `src/components/Universe/UniverseView.jsx` — Copia inline del layout idéntica

---

## 42. Mapeo Continuo Logarítmico - Eliminación de Zonas Discretas

**Problema**: El layout original asignaba cada org a una de 3 zonas discretas (core, mid, isolated) con umbrales fijos, y luego posicionaba aleatoriamente dentro de cada zona. Esto creaba artefactos:
1. Dos orgs con scores casi idénticos podían quedar en zonas diferentes si caían a cada lado del umbral.
2. Dentro de una zona, no había diferenciación: la org #2 y la #14 tenían la misma distribución radial.
3. Los umbrales eran constantes arbitrarias sin base en la distribución de los datos.

**Solución**: Mapeo continuo logarítmico — cada organización recibe un radio target proporcional a su score, sin discretización.

**Fórmula matemática**:
```
normalized = log(1 + score) / log(1 + maxScore)    // [0, 1] comprimido log
curved     = normalized^0.7                         // más resolución en el top
targetR    = PERIPHERY_MAX × (1 - curved)           // curved≈1 → centro, curved→0 → periferia
band       = max(MIN_SEP, targetR × 0.15)           // tolerancia de placement
```

**Justificación de la escala logarítmica**: Los datos de colaboración siguen una distribución power-law (Qiskit=486, mediana=16, ratio 30×). Una escala lineal colapsaría el 90% de las orgs en una franja estrecha de la periferia. La transformación logarítmica comprime el rango dinámico preservando las diferencias relativas: una org con raw=486 queda en el centro (targetR≈0), una con raw=48 a ~591 del centro, y una con raw=5 a ~1236.

**Curva de potencia 0.7**: Sin ella, la transformación log pura ya es bastante compresiva. El exponente 0.7 (sublineal) da más resolución espacial a las orgs top, separando mejor Qiskit de PennyLaneAI de Microsoft, mientras comprime ligeramente el rango medio-bajo donde las diferencias son menos significativas.

**Monte Carlo placement (80 intentos)**: Cada org busca la mejor posición dentro de su banda `[targetR - band, targetR + band]` maximizando separación con vecinos ya colocados y minimizando distancia al centroide de sus colaboradores (neighbor attraction). El org #1 se fija en el origen (0,0,0).

**Archivos modificados**:
- `src/components/Universe/computeLayout.worker.js` — Fase 3 completamente reescrita
- `src/components/Universe/UniverseView.jsx` — Copia inline idéntica

---

## 43. Rediseño del Sistema de Clasificación de Roles de Red

**Problema**: La clasificación de Network Role usaba umbrales de percentil > 50, lo que significaba que aproximadamente la mitad de las entidades activas se clasificaban como "Hub Central". Microsoft (percentil 78 centralidad, 63 conectividad) recibía el label "Hub Central" a pesar de estar posicionado en la zona mid — una contradicción entre el rol mostrado y la posición espacial.

**Análisis del fallo**: Un percentil > 50 no es selectivo. En una distribución de 127 orgs activas, el percentil 50 marca exactamente la mediana. Cualquier org con actividad por encima de la media se etiquetaba como "Hub".

**Solución**: Sistema granular de 7 niveles con umbrales estrictos basados en percentiles ≥ 85 (top ~15%) para los roles principales.

| Rol | Condición | Entidades típicas |
|------|----------|--------------------|
| **Hub Central** | pct_centrality ≥ 85 AND pct_connectivity ≥ 85 | Qiskit, PennyLaneAI, unitaryfoundation |
| **Hub Colaborativo** | pct_centrality ≥ 85 AND pct_connectivity ≥ 60 | qiskit-community, qosf |
| **Nodo Activo** | pct_centrality ≥ 60 AND pct_connectivity ≥ 60 | Microsoft, NVIDIA |
| **Puente Estratégico** | pct_centrality ≥ 60 AND pct_connectivity < 60 | Orgs con pocas pero estratégicas conexiones |
| **Conector Local** | pct_centrality < 60 AND pct_connectivity ≥ 60 | Bien conectado localmente, no central |
| **Nodo Emergente** | raw_centrality > 0 AND raw_connectivity > 0 | Actividad incipiente |
| **Nodo Especializado** | Default | Nicho especializado, bajo inter-org |

**Coherencia con el layout**: Microsoft (raw=113, pct_centrality=78, pct_connectivity=63) → **Nodo Activo** (pct ambos ≥ 60 pero ninguno ≥ 85). Posición espacial: zona core (radio ~364, dentro del cluster de alta colaboración). El rol y la posición son ahora coherentes: es activo y está en el core, pero no es un Hub como Qiskit.

**Archivo modificado**:
- `src/components/Universe/computeDetailData.worker.js` — Bloque `NETWORK ROLE CLASSIFICATION` (líneas 342-379)

---

## 44. Fronteras de Zona con Jenks Natural Breaks - Data-Driven Boundaries

### 44.1 Problema fundamental: constantes arbitrarias como frontera analítica

Las secciones anteriores (§41-§42) eliminaron el percentil y añadieron mapeo continuo, pero mantenían constantes arbitrarias para definir las **fronteras de zona** (los anillos visuales que separan core, mid y periferia):

```javascript
// ANTES: constantes elegidas a mano
const CORE_RADIUS   = 150 * scaleFactor  // → luego 200 (igual de arbitrario)
const PERIPHERY_MIN = 500 * scaleFactor
```

Un análisis exhaustivo con datos reales demostró que estas constantes eran artefactos:

| CORE_RADIUS | Orgs en core | ¿Hay ruptura natural en ese punto? |
|---|---|---|
| 150 | 14 | NO - gap entre rank 14→15 = 6.5% (insignificante) |
| 200 | 26 | NO - ajustado para "incluir a Microsoft", no por los datos |

La **única ruptura natural significativa** en la distribución de scores estaba entre rank 6→7 (gap = 22.4%). Las fronteras no correspondían a ninguna estructura real de los datos; eran decisiones nuestras impuestas sobre la visualización.

**Implicación para el TFG**: Una visualización científica no puede presentar clusters como "descubrimientos" cuando en realidad son artefactos de parámetros elegidos por el desarrollador. Las fronteras deben emerger de los datos.

### 44.2 Algoritmo de Jenks Natural Breaks (Fisher-Jenks)

**Referencia**: Fisher, W.D. (1958). "On Grouping for Maximum Homogeneity". *Journal of the American Statistical Association*, 53(284), 789-798.

El algoritmo de Jenks (también conocido como Fisher-Jenks) es un método de clasificación óptima que divide un conjunto de datos 1D en *k* clases minimizando la **Sum of Squared Deviations from Class Means** (SDCM), equivalente a minimizar la varianza intra-grupo. Es el estándar en cartografía y GIS para clasificaciones coropletas, y es exactamente el problema que necesitamos resolver: dado un vector de radios target (derivados del mapeo logarítmico), ¿dónde están las fronteras naturales?

**Formulación matemática**:

Dado un vector ordenado $x_1 \leq x_2 \leq \cdots \leq x_n$ y $k$ clases, minimizar:

$$\text{SDCM} = \sum_{c=1}^{k} \sum_{i \in C_c} (x_i - \bar{x}_c)^2$$

donde $C_c$ es el conjunto de elementos en la clase $c$ y $\bar{x}_c$ su media.

**Solución por programación dinámica** $O(n^2 \cdot k)$:
- `vari[i][j]` = SDCM mínima para clasificar los primeros `i` elementos en `j` clases
- `lower[i][j]` = índice de inicio óptimo de la clase `j`-ésima
- Recurrencia: $\text{vari}[l][j] = \min_{i_3 \geq 2} \left( v(i_3, l) + \text{vari}[i_3-1][j-1] \right)$
- donde $v(i_3, l)$ es la varianza del segmento $[i_3, l]$

La complejidad $O(n^2 \cdot k)$ es trivial para nuestro caso (n=127, k=3 → ~48.000 operaciones).

**Frontera entre clases**: Punto medio entre el último elemento de la clase $c$ y el primero de la clase $c+1$:
$$b_c = \frac{x_{\text{end}(c)} + x_{\text{start}(c+1)}}{2}$$

### 44.3 Pipeline completo del posicionamiento

El pipeline de layout opera ahora en 4 etapas completamente data-driven:

```
┌─────────────────────────────────────────────────────────────────────┐
│                 ETAPA 1: Obtener scores                            │
│  orgScore[id] = collab_centrality_raw  (suma de contributors      │
│                 compartidos con otras orgs - valor absoluto)       │
└────────────────────────┬────────────────────────────────────────────┘
                         │ scores raw (distribución power-law)
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│              ETAPA 2: Mapeo logarítmico a radios                   │
│  normalized = log(1+score) / log(1+maxScore)                       │
│  curved = normalized^0.7                                           │
│  targetR = PERIPHERY_MAX × (1 - curved)                            │
│                                                                     │
│  PERIPHERY_MAX es el ÚNICO parámetro (escala visual del lienzo).   │
│  NO define fronteras — solo el tamaño del universo.                 │
└────────────────────────┬────────────────────────────────────────────┘
                         │ vector de radios target [r₁, r₂, ..., rₙ]
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│            ETAPA 3: Jenks Natural Breaks (k=3)                     │
│  jenksNaturalBreaks(allTargetRadii, 3)                             │
│   → CORE_BOUNDARY  (frontera core/mid)                             │
│   → MID_BOUNDARY   (frontera mid/peripheral)                       │
│                                                                     │
│  Ambas fronteras emergen de la distribución.                        │
│  Con datos diferentes, las fronteras serían diferentes.             │
└────────────────────────┬────────────────────────────────────────────┘
                         │ fronteras + targetR por org
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│            ETAPA 4: Placement Monte Carlo (80 intentos)            │
│  Org #1: origin (0,0,0)                                            │
│  Orgs con score>0: placeOrg(targetR ± band)                        │
│  Orgs con score=0: placeOrg(MID_BOUNDARY, PERIPHERY_MAX)           │
│  Optimiza: separación mínima + atracción a vecinos colaboradores   │
│                                                                     │
│  Zonas (core/mid/isolated) se derivan POST-PLACEMENT               │
│  comparando radio final vs CORE_BOUNDARY y MID_BOUNDARY.           │
└─────────────────────────────────────────────────────────────────────┘
```

### 44.4 Resultados con datos reales

Ejecutado contra el dataset real (1224 orgs, 127 con raw>0, maxRaw=486):

**Goodness of Variance Fit (GVF) = 0.9050** — la clasificación en 3 grupos explica el 90.5% de la varianza total. Un GVF > 0.8 se considera excelente en la literatura de clasificación geoespacial.

| Zona | Orgs | Radio frontera (Jenks) | Descripción |
|------|------|------------------------|-------------|
| **Core** | 53 | < 717 | Cluster denso de alta colaboración |
| **Mid** | 33 | 717 - 1269 | Colaboración moderada |
| **Peripheral** | 41 | > 1269 | Actividad incipiente o aislada |

**Comparación con las constantes anteriores**:
| | Constante arbitraria (anterior) | Jenks Natural Breaks (actual) |
|---|---|---|
| Core boundary | 474 (~CORE_RADIUS=200 × scaleFactor) | **717** (data-driven) |
| Mid boundary | 1184 (~PERIPHERY_MIN=500 × scaleFactor) | **1269** (data-driven) |

**Verificación de orgs clave**:
| Organización | raw | targetR | Zona (Jenks) | Zona (anterior con CORE=200) |
|---|---|---|---|---|
| Qiskit | 486 | 0 | CORE | CORE |
| Microsoft | 113 | 364 | CORE | CORE (antes MID con CORE=150) |
| NVIDIA | 115 | 359 | CORE | CORE (antes MID con CORE=150) |
| sebastienrousseau | 48 | 591 | CORE | CORE |
| dwavesystems | 34 | 685 | CORE | MID |
| USCqserver | 28 | 739 | MID | MID |
| cduck | 4 | 1301 | PERIPHERAL | PERIPHERAL |

### 44.5 Propiedad de adaptabilidad

La ventaja fundamental sobre constantes es la **adaptabilidad a datos futuros**. Si mañana:
- Se añaden 500 orgs con raw ∈ [100, 300] → las fronteras migrarán automáticamente.
- El ecosistema se polariza (pocas orgs muy activas, muchas inactivas) → Jenks detectará 2 clusters en vez de 3 distribuciones uniformes.
- Se añade un nuevo actor dominante con raw=1000 → toda la distribución de radios se reescala por el mapeo log, y Jenks recalcula las fronteras para reflejarlo.

Con constantes, cada cambio en el dataset requeriría re-sintonizar a mano. Con Jenks, el algoritmo siempre encuentra las fronteras óptimas para esos datos.

### 44.6 Fallback para datasets pequeños

Si el número de orgs con colaboración es < 6 (insuficiente para Jenks con k=3), se aplica un fallback proporcional:
```javascript
CORE_BOUNDARY = PERIPHERY_MAX * 0.25   // 25% interior
MID_BOUNDARY  = PERIPHERY_MAX * 0.6    // 60% interior
```

### 44.7 Implementación técnica

**Función `jenksNaturalBreaks(data, nClasses)`** añadida a:
- `src/components/Universe/computeLayout.worker.js` — Líneas 27-92
- `src/components/Universe/UniverseView.jsx` — Copia inline (función standalone antes de `computeLayout`)

**Flujo en la Fase 3 del layout**:
1. Pre-computation: `orgTargetR[id] = PERIPHERY_MAX × (1 - (log(1+score)/log(1+maxScore))^0.7)`
2. Collect: `allTargetRadii = Object.values(orgTargetR)`
3. Classify: `{ boundaries, classStarts } = jenksNaturalBreaks(allTargetRadii, 3)`
4. Assign: `CORE_BOUNDARY = boundaries[0]`, `MID_BOUNDARY = boundaries[1]`
5. Place: Monte Carlo con `targetR` pre-computado (no re-calcula log)
6. Derive zones: post-placement, `r <= CORE_BOUNDARY → core`, `r <= MID_BOUNDARY → mid`, else `isolated`

**Zona metadata** (para toggle de fronteras visuales):
```javascript
zoneMeta = { coreRadius: CORE_BOUNDARY, peripheryMin: MID_BOUNDARY, peripheryMax: PERIPHERY_MAX, ... }
```

### 44.8 Scripts de verificación

Se crearon 3 scripts de análisis en `Backend/scripts/` para verificar cada decisión con datos reales:

| Script | Propósito |
|--------|-----------|
| `_check_org_scores.py` | Consulta MongoDB para obtener distribución real de `collab_centrality_raw` |
| `_zone_analysis.py` | Simula diferentes `CORE_RADIUS` y encuentra gaps naturales entre orgs consecutivas |
| `_validate_jenks.py` | Replica el pipeline completo (log mapping + Jenks) con datos reales y calcula GVF |

Estos scripts no forman parte de la aplicación; son herramientas de validación analítica.

**Archivos modificados/creados**:
- `src/components/Universe/computeLayout.worker.js` — Función `jenksNaturalBreaks()`, pre-cómputo de `orgTargetR`, eliminación de `CORE_RADIUS` y `PERIPHERY_MIN` como constantes
- `src/components/Universe/UniverseView.jsx` — Copia inline idéntica de todos los cambios
- `Backend/scripts/_check_org_scores.py` — **Nuevo** (verificación)
- `Backend/scripts/_zone_analysis.py` — **Nuevo** (análisis de gaps)
- `Backend/scripts/_validate_jenks.py` — **Nuevo** (validación GVF)

---

## §45. Clasificación 100% data-driven de todas las métricas del panel de detalle

**Fecha**: 20/02/2026
**Problema**: Todas las métricas del panel de detalle usaban umbrales arbitrarios, constantes mágicas y factores de escala inventados. Se identificaron **28 grupos de thresholds hardcoded** distribuidos en `computeDetailData.worker.js` y `UniverseView.jsx`. Esto generaba incoherencias (e.g., una org en la Zona Core clasificada como "Nodo Activo" en vez de Hub) y valores que no reflejaban la posición real de la entidad en su población.

**Filosofía**: "Todas las métricas deberían ser data-driven, no inventarnos nosotros las clasificaciones" — las fronteras deben emerger de los datos, no de constantes arbitrarias.

### 45.1 Auditoría completa de umbrales

Se realizó una auditoría exhaustiva que identificó:

| Categoría | Cantidad | Tipo de umbral |
|-----------|----------|----------------|
| logScale max values | 7 | `logScale(val, 80/500/2000/15/20000/12)` |
| Health Score factores | 5 | `crossPol*1.5`, `bridge*2`, `langs/5`, `spread*50`, `BF*25` |
| Health Score pesos | 5 | `0.25, 0.25, 0.20, 0.15, 0.15` |
| Texto clasificatorio | 2 | `>50 "Alta"`, `>2 "Hub"` |
| Key Dependencies pesos | 2 | `repoCount*2 + soleConns*10` |
| Impact severity | 2 | `reposAffected > 2`, `isBridge ? 8 : 3` |
| Display colors | 2 | `healthScore >= 70/40`, `similarity > 80/60` |
| **Total** | **25** | **umbrales analíticos arbitrarios eliminados** |

Se conservaron sin cambios las constantes de diseño visual (SVG viewBox, font sizes, radii de pentágono, truncamiento de listas, DNA helix) porque son decisiones de UX, no métricas analíticas.

### 45.2 Nuevas funciones: `percentileRank` y `computePopulationStats`

#### `percentileRank(sorted, value)` — O(log n)

Búsqueda binaria que computa la fracción de la población con valor inferior. Usa mid-rank CDF para manejar empates:

```javascript
function percentileRank(sorted, value) {
  // bisectLeft: count below
  // bisectRight: count below + equal
  // resultado: (countBelow + 0.5 * countEqual) / n
}
```

#### `computePopulationStats(entityType, universeData, networkMetrics, idx)`

Recorre **toda la población** del mismo tipo una sola vez y genera arrays ORDENADOS (listos para `percentileRank`) de cada métrica:

| Tipo | Métricas computadas | n típico |
|------|---------------------|----------|
| **org** | crossPollinations, bridgePcts, influences, langCounts, busFacts, spreadCoeffs | ~127 |
| **repo** | orgDiversities, userCounts, bridgeRatios | ~866 |
| **user** | orgSpans, langCounts, collabExposures | ~12641 |

Se llama una vez por invocación del worker (al abrir panel de detalle) y se pasa via `_pop` a Phase 2 y Phase 3.

### 45.3 Radar pentagonal — de logScale a percentileRank

**Antes**: Cada eje usaba `logScale(value, MAX_ARBITRARIO)` donde MAX era un número inventado (e.g., `logScale(userCoContributors.length, 20000)`). Problemas:
- El máximo no se adaptaba si la población cambiaba
- Valores distorsionados: un repo con 3 orgs en un ecosistema de max 5 no se distinguía de uno con 3 en un ecosistema de 500
- Las escalas eran inconsistentes entre ejes

**Ahora**: Cada eje = `percentileRank(distribución_del_tipo, valor)`:

| Eje | Org | Repo | User |
|-----|-----|------|------|
| Centralidad | pct backend (ya era %) | pct backend | pct backend |
| Conectividad | pct backend (ya era %) | pct backend | pct backend |
| Eje 3 | `percentileRank(crossPollinations)` | `percentileRank(orgDiversities)` | `percentileRank(orgSpans)` |
| Eje 4 | `percentileRank(bridgePcts)` | `percentileRank(bridgeRatios)` | `percentileRank(collabExposures)` |
| Eje 5 | `percentileRank(influences)` | `percentileRank(userCounts)` | `percentileRank(langCounts)` |

Los tooltips ahora muestran "Percentil X" con contexto: *"Percentil 82 - proporción de bridge users vs. población"*.

### 45.4 Health Score — de factores arbitrarios a percentil puro

**Antes**: Factores de escala inventados multiplicaban raw values para "normalizar" a 0-100:
```
diversityScore = min(crossPollination * 1.5, 100)   // 67% → satura
bridgeNetworkScore = min(bridgePct * 2, 100)         // 50% → satura
langVarietyScore = min(langs / 5 * 100, 100)         // 5 = "perfecto"
spreadScore = max(0, 100 - spreadDev/avg * 50)       // 50 = arbitrario
resilienceScore = min(avgBF * 25, 100)               // BF 4 = "perfecto"
// Pesos: 25% div + 25% res + 20% bridge + 15% tech + 15% spread
```

**Ahora**: Cada componente = `percentileRank × 100`:
```
diversityScore = percentileRank(pop.crossPollinations, orgCrossPollination) * 100
bridgeNetworkScore = percentileRank(pop.bridgePcts, orgBridgePct) * 100
langVarietyScore = percentileRank(pop.langCounts, orgLangs.length) * 100
spreadScore = (1 - percentileRank(pop.spreadCoeffs, spreadCoeff)) * 100  // invertido
resilienceScore = percentileRank(pop.busFacts, avgBF) * 100
// Score final = media aritmética (contribución igualitaria)
```

El score ahora significa: "en qué percentil medio se encuentra esta org entre todas las orgs activas". Un 72 significa que la org supera al 72% de las orgs en el promedio de las 5 dimensiones.

El arco SVG usa terciles naturales (67/33) para colores en vez de los anteriores 70/40.

### 45.5 Key Dependencies — criticidad proporcional al scope

**Antes (orgs)**: `criticality = repoCount * 2 + soleConnections * 10`, filtro `> 2` — un usuario con 2 repos en una org de 200 tenía la misma criticidad que uno con 2 repos en una org de 3.

**Ahora**: Proporcional al scope de la entidad:
```javascript
const repoPct = repoCount / totalRepos               // ¿Qué fracción de repos toca?
const solePct = soleConnections / totalExtOrgs        // ¿Qué fracción de conexiones externas dependen solo de él?
const criticality = repoPct * 0.4 + solePct * 0.6    // Peso mayor a conexiones únicas
```

**Antes (repos)**: `criticality = (isBridge ? 5 : 0) + soleConnections * 10`

**Ahora**: `criticality = (isBridge ? 0.3 : 0) + (soleConnections / totalExtOrgs) * 0.7`

### 45.6 Impact Simulation — severidad y healthDelta proporcionales

**Antes**: `severity = orgConnectionsLost > 0 ? 'critical' : reposAffected > 2 ? 'high' : 'moderate'`. El `healthDelta = -(isBridge ? 8 : 3) + orgConnectionsLost * 5`.

**Ahora**: Severidad proporcional: `repoImpactRatio > 0.3` (30% del total) = high. HealthDelta proporcional al scope real:
```javascript
healthDelta = -healthScore * (orgConnPct * 0.6 + repoPct * 0.4)
// donde orgConnPct = orgConnectionsLost / totalConnectableOrgs
//       repoPct = reposAffected / totalRepos
```

### 45.7 Similar Entities — consistencia con radar

**Antes**: `computeRadar` en Phase 3 usaba los mismos `logScale(val, MAX)` hardcoded. Problema: la distancia euclidiana entre vectores radar era inconsistente con los valores del radar de la entidad seleccionada.

**Ahora**: Usa `percentileRank(pop.*, val)` — exactamente las mismas distribuciones que el radar del entity seleccionado. La similaridad refleja posición poblacional real, no escalas arbitrarias.

### 45.8 Texto de análisis — clasificación por cuartiles

**Antes**: `orgCrossPollination > 50 → "Alta"`, `> 20 → "Moderada"`, `repoHubScore > 2 → "Hub"`.

**Ahora**: Todos los textos clasificatorios usan percentileRank contra la población:
- Cross-pollination: `≥ p75` = "Alta", `≥ p25` = "Moderada", `< p25` = "Baja"
- Hub score: `≥ p75` = "Hub inter-org", `≥ p25` = "Diversidad moderada", `< p25` = "Diversidad baja"
- Incluyen el percentil en el texto: *"Alta cross-pollination (34%, p78)"*

### 45.9 Network Role — Jenks bidimensional (sesión anterior, completado)

Los roles se clasifican con Jenks Natural Breaks (k=3) sobre `collab_centrality_raw` Y `collab_connectivity_raw` por tipo de entidad:

```
  cent\conn  │ high        │ mid         │ low
  ───────────┼─────────────┼─────────────┼─────────────
  high       │ Hub Central │ Hub Colab.  │ Puente Estr.
  mid        │ Conect.Denso│ Nodo Activo │ Nodo Focal.
  low        │ Conect.Soc. │ Nodo Emerg. │ Nodo Incip.
  none       │             │             │ Nodo Aislado
```

Las fronteras entre high/mid/low emergen de los datos (Jenks minimiza varianza intra-clase). Cero umbrales arbitrarios.

### 45.10 Resumen de umbrales eliminados vs. conservados

**ELIMINADOS** (25 analíticos):
- 7× logScale max values → percentileRank
- 5× health score multiplicadores → percentileRank
- 5× health score pesos → media aritmética
- 2× texto clasificatorio → cuartiles
- 2× key dependencies pesos → proporcional al scope
- 2× impact severity thresholds → ratio proporcional
- 2× display color thresholds → terciles

**CONSERVADOS** (13 visuales/UX):
- SVG viewBox, radii, font sizes (geometría visual)
- Truncamiento de listas (6/12, 8/20, etc.)
- DNA helix segmentos, amplitudes (diseño generativo)
- Collab matrix range (2-15 repos)
- Radar `radarAxes.length === 5` (forma pentagonal)

**Archivos modificados**:
- `src/components/Universe/computeDetailData.worker.js` — `percentileRank()`, `computePopulationStats()`, radar, health, key deps, impact, analysis text, similar entities
- `src/components/Universe/UniverseView.jsx` — Color del arco de salud (70/40 → 67/33)

---

## 46. Sistema de Lentes Analíticas - Overhaul Completo

**Problema**: Las 4 lentes analíticas (Centralidad, Intensidad, Bus Factor, Comunidades) no producían cambios visuales perceptibles. Al activar cualquiera, el universo se veía prácticamente igual.

### 46.1 Diagnóstico: 4 problemas fundamentales

1. **Distribución aplastada**: `betweenness` y `degree` tienen distribuciones power-law extremas (~95% de nodos cerca de 0.001). Los valores raw producían brillo uniforme.

2. **Multiplicación por material púrpura**: El color final = `instanceColor × materialColor`. El material de los repos es `#bd00ff × 1.8` = RGB(1.334, **0**, 1.8). Como **G=0**, cualquier componente verde del instanceColor se destruía:
```
Bus Factor high  (1.8, 0.9, 0.1) × (1.33, 0, 1.8) = (2.4, 0, 0.18) → ROJO, no naranja
Bus Factor low   (0.2, 1.6, 0.4) × (1.33, 0, 1.8) = (0.27, 0, 0.72) → AZUL, no verde
```
Resultado: solo se veían rojo y azul, nunca naranja/amarillo/verde.

3. **Percentile rank mezclado**: Se calculaba sobre los ~30K nodos mezclados (26K users + 1.6K repos + 1.2K orgs). Los repos quedaban comprimidos en percentiles 93-99% → brillo casi idéntico.

4. **Sin reducción de ruido**: Bonds, channels, arcos, efectos ambientales competían visualmente con los nodos coloreados por la lente.

### 46.2 Solución A: Material lerp a blanco

Cuando una lente está activa, el `useFrame` de Qubits hace `qubitMat.color.copy(baseQubitCol).lerp(whiteMat, blend)`. Con material blanco, `instanceColor × (1,1,1)` = instanceColor → los colores se renderizan tal cual.

```javascript
// En Qubits useFrame:
if (blend > 0.01) {
  qubitMat.color.copy(baseQubitCol).lerp(whiteMat, blend)
} else {
  qubitMat.color.copy(baseQubitCol)
}
```

### 46.3 Solución B: Percentile rank por tipo de entidad

Repos se comparan solo contra repos, orgs/users contra su propia población:
```javascript
const repoEntries = [], otherEntries = []
Object.entries(nm).forEach(([id, m]) => {
  if (id.startsWith('repo_')) repoEntries.push([id, m])
  else otherEntries.push([id, m])
})
const repoVals = repoEntries.map(([, m]) => m.degree || 0).sort((a, b) => a - b)
// percentileRank against repo-only distribution
```

### 46.4 Solución C: Repos amplificados, no-repos atenuados

Repos reciben brillo `0.05 + t² × 1.8` (rango 0.05→1.85), orgs/users reciben `0.03 + t² × 0.35` (rango 0.03→0.38). Los repos dominan visualmente.

### 46.5 Solución D: Bus Factor con colores reales

```javascript
const riskBrightness = {
  critical: { r: 1.8, g: 0.2, b: 0.15 },   // rojo brillante
  high:     { r: 1.8, g: 0.9, b: 0.1 },     // naranja
  medium:   { r: 1.6, g: 1.5, b: 0.15 },    // amarillo
  low:      { r: 0.2, g: 1.6, b: 0.4 },     // verde
}
```

### 46.6 Solución E: Reducción de ruido con dimmed

La condición `dimmed` ahora incluye `lensData !== null`:
```javascript
const dimmed = selectedEntity !== null || searchHighlightSet !== null
  || entityFilter.size > 0 || lensData !== null
```

Se propaga `dimmed` a 9 componentes visuales, cada uno con su multiplicador:

| Componente | Opacidad con lente activa |
|---|---|
| ProbabilityClouds | × 0.008 |
| QuantumBonds (channels) | × 0.008 |
| EntanglementChannels | × 0.015 |
| OrgEntanglementArcs | × 0.05 |
| EnergyRings | × 0.03 |
| BlochAxes | × 0.04 |
| TunnelingPulses | × 0.04 |
| DecoherenceWaves | × 0.04 |
| HawkingRadiation | target 0.03 (vs 0.7 normal) |

### 46.7 Validación con datos reales

Script `scripts/_lens_analysis.py` verifica distribuciones contra el endpoint `/collaboration/network-metrics`:

| Lente | Brillo min→max repos | Unique values | Estado |
|---|---|---|---|
| Intensidad | 0.050 → 1.850 (delta=1.8) | 104/1646 | ✅ |
| Centralidad | 0.050 → 1.850 (delta=1.8) | 453/1646 | ✅ |
| Bus Factor | 4/4 niveles presentes (82.8% critical, 12.2% high, 3.9% medium, 1.0% low) | 4 | ✅ |

### 46.8 Escalado por lente

Los repos también cambian de tamaño según el valor de la lente. `lensScaleFactor = 0.5 + avg_brightness × 1.0`. Repos brillantes crecen, tenues encogen. Mismo principio para orgs. Users usan el shader GLSL: `lensScale = mix(1.0, 0.5 + lensBrightness * 0.8, uLensActive)`.

**Archivos modificados**:
- `src/components/Universe/UniverseView.jsx`:
  - `lensData` useMemo: percentileRank por tipo, repos amplificados, non-repos atenuados
  - `Qubits`: material lerp a blanco, prop `activeLens` removido (usa `blend` de `lensData`)
  - `dimmed` condition: `|| lensData !== null`
  - Props `dimmed` pasados a EnergyRings, BlochAxes, HawkingRadiation, DecoherenceWaves, TunnelingPulses
  - Cada componente de efecto: firma actualizada, opacidad reducida cuando `dimmed`
- `scripts/_lens_analysis.py` — Script de validación de distribuciones
