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
| `src/components/Universe/computeLayout.worker.js` | **Nuevo** — Web Worker |
| `src/components/Universe/UniverseView.jsx` | Modificado — Worker, Canvas defer, loader SVG, montaje progresivo, shaders GPU, bridge reveal, efectos gating, optimizaciones |
| `src/components/Universe/UniverseView.module.css` | Modificado — Átomo SVG, mensajes CSS, pointer-events |
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
- **useRef para animación**: Escribir progreso directamente al ref en `useFrame` — cero re-renders React desde el bucle de render
- **GPU clip-space culling**: Mover vértices a `vec4(9999,9999,9999,1)` cuando deben ser invisibles — bypasses the GPU's minimum `gl_PointSize` clamping
- **Early returns en useFrame**: Saltar loops pesados cuando el progreso es 0 — ahorra 15-50ms/frame con 1.33M iteraciones
- **Montaje progresivo con yields**: Chunks pequeños + `yieldToMain()` para evitar "página no responde"
- **Staggering per-elemento**: Seeds pseudo-aleatorios en shaders GLSL para materialización progresiva vs flash simultáneo
- **Narrativa visual coherente**: Bridges se "descubren" durante entanglement, no aparecen pre-etiquetados

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
| `src/components/Universe/computeLayout.worker.js` | **Nuevo** — Web Worker layout |
| `src/components/Universe/computeDetailData.worker.js` | **Nuevo** — Web Worker panel (2 fases), índices globales, escala logarítmica, logMax calibrados con datos reales |
| `src/components/Universe/UniverseView.jsx` | Modificado — Worker, Canvas defer, loader SVG, montaje progresivo, shaders GPU, bridge reveal, efectos gating, panel expandido, 4 features, tooltips, health gauge, Hawking, carga progresiva, viewBox radar |
| `src/components/Universe/UniverseView.module.css` | Modificado — Panel layout, scrollbar, skeletons, tooltips, health SVG, DNA/matrix/impact/similar CSS |
| `src/services/api.js` | Modificado — `discoverCollaboration(forceRefresh)` con `?force=true` y timeout 2min |
| `src/store/dashboardStore.js` | Modificado — Propaga `forceRefresh` a `discoverCollaboration`, `refreshMetrics()` invalida cachés antes de recargar |
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
- **Caché permanente sin TTL**: Los datos en `metrics` persisten hasta invalidación explícita — una app desplegada en la nube sirve siempre desde caché
- **Invalidación centralizada**: `invalidate_all_caches()` elimina todos los cachés (chunked, document, in-memory) con una sola llamada
- **Invalidación automática post-ingesta**: Cada tarea de ingesta/enriquecimiento invalida cachés al completarse — la siguiente carga recalcula datos frescos

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
