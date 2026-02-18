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
