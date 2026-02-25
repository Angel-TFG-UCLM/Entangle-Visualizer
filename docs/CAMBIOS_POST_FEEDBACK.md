# Cambios realizados tras el feedback del tutor

## 1. Rendimiento y estabilidad

- **React.memo en QuantumScene**: la escena 3D ya no se re-renderiza al abrir/cerrar el panel de detalles ni al cambiar hover, eliminando stuttering durante la rotación.
- **Lerp delta-time aware**: la animación fly-to de cámara usa `1 - Math.exp(-4.5 * delta)` en vez de un factor fijo, garantizando velocidad consistente independientemente del frame rate.
- **isDraggingRef**: suprime el sistema de hover durante el arrastre de cámara (~16 componentes × 60fps de re-renders eliminados).
- **Dispose de geometrías**: `BlochAxes`, `QuantumParticles`, `QuantumBonds`, `OrgEntanglementArcs`, `QuantumTunnelBeam` y `ZoneBoundary` ahora liberan geometrías en unmount/cambio de deps (memory leaks corregidos).
- **Pre-allocación de objetos Three.js**: colores del halo del tunnel beam y `blochColor` se crean una sola vez (reducción de GC pressure en el render loop).
- **RequestId en Web Worker**: el worker de detalle (`computeDetailData.worker.js`) incluye `requestId` para descartar resultados obsoletos si el usuario seleccionó otra entidad antes de que terminara el cálculo.
- **try/finally en transición de lentes**: garantiza reset del estado de transición incluso si ocurre una excepción.
- **Cleanup de timers**: `exitTimerRef` y `closePanelTimerRef` se limpian en unmount para evitar actualizaciones de estado en componentes desmontados.
- **Espera de métricas antes de layout**: el layout no se computa hasta que las métricas de red se han cargado, evitando doble computación que cambiaba posiciones en pantalla.

## 2. UX e interacción

- **Bloqueo de pan con entidad seleccionada**: `enablePan={!selectedEntity}` — al seleccionar una entidad, el pan se desactiva y el scroll hace zoom orbital alrededor del target fijo en vez de desplazar la cámara.
- **ViewportLabels**: nuevo componente que proyecta hasta 8 labels automáticos de entidades relacionadas en el viewport durante la rotación con foco. Prioriza por tipo (org > repo > user), elimina overlaps (70px mín.), actualiza cada ~250ms.
- **FloatingLabel mejorado**: tooltip hover ahora se posiciona ENCIMA de la entidad (offset Y según tipo: org=7, repo=3.5, user=2) con anclaje inferior y animaciones de entrada/salida suaves (scale + blur). Movido fuera de `QuantumScene` para no causar re-renders de la escena 3D.
- **Cursor oculto durante rotación**: se esconde al hacer pointerdown y reaparece al soltar.
- **Settings sobre panel de detalles**: corregido z-index del header (10 → 25) para que el dropdown de ajustes no quede detrás del panel de detalles.
- **Filtros tipo + selección**: cuando hay una entidad seleccionada Y un filtro de tipo activo, se intersectan los conjuntos — solo se muestran las entidades relacionadas que además coinciden con el filtro de tipo.
- **Filtro de favoritos en universo**: nuevo toggle en settings que muestra solo entidades favoritas. Herencia: si una org es favorita, sus repos y users también se incluyen.
- **Hover sobre entidades dimmed**: bloqueado hover sobre entidades no resaltadas cuando hay cualquier tipo de dimming activo (lente, filtro, favoritos, búsqueda, tunnel, selección).

## 3. Visualización

- **Transición multi-org (comunidades)**: usuarios que contribuyen a ≥2 organizaciones transicionan suavemente entre los colores de comunidad de cada org. Periodo aleatorio (2.5-5.5s), 70% hold / 30% smoothstep, fase desplazada por seed para efecto orgánico.
- **Color de canales de entrelazamiento**: cambiado de dorado (#ffbd00) a cyan (#00d4e4) para coherencia con la paleta.
- **Color de pulsos de tunneling**: cambiado de dorado a azul claro (#aaddff).
- **Animaciones CSS en labels**: entry (`label3dIn`: 0.22s scale+blur) y exit (`label3dOut`: 0.15s) con cubic-bezier. Auto-labels con animación `autoLabelFadeIn` similar.
- **Visibilidad de canales en foco**: cuando hay entidad seleccionada con dimming, los canales del highlightSet mantienen opacidad 0.4 (antes era 0.05 y desaparecían).

## 4. Terminología y reframing

- **"Bus Factor" → "Resiliencia"**: renombrado en toda la UI (botones, lentes, panel de detalles, ayuda).
- **Etiquetas de riesgo reposicionadas como positivas**:
  - critical → "PILAR CLAVE" (1 contribuidor esencial)
  - high → "NÚCLEO REDUCIDO" (2)
  - medium → "EQUILIBRADO" (3-4)
  - low → "ALTA RESILIENCIA" (5+)
- **Nomenclatura de entidades**: invertido el orden para priorizar el concepto real sobre la metáfora cuántica:
  - "Procesadores Cuánticos" → "Organizaciones (Procesadores)"
  - "Qubits" → "Repositorios (Qubits)"
  - "Partículas Cuánticas" → "Usuarios (Partículas)"
  - "Partículas Entrelazadas" → "Bridge Users (Entrelazadas)"
- **Leyenda y métricas inferiores**: cambiado de metáfora a nombre real primero ("Orgs", "Repos", "Users", "Bridge").
- **Panel de detalles**: "Partícula Entrelazada" → "Bridge User (Entrelazada)".
- **Textos de ayuda**: reescritos para que la metáfora cuántica complementa la explicación real en vez de sustituirla.

## 5. Dashboard (ChartsSection)

- **StaggeredTick**: nuevo componente para etiquetas del eje X que alterna arriba/abajo, evitando solapamiento sin rotar texto a 45°. Aplicado a los 3 gráficos de barras.
- **Colores del PieChart**: corregido — usaba `CHART_COLORS[index % 5]` (5 colores cíclicos), ahora usa `PIE_COLORS[index]` (7 colores únicos incluyendo gris para "Otros").
- **Hints de interacción**: las indicaciones "Click para filtrar · Shift+Click..." ahora muestran las teclas con estilo `<kbd>` monoespaciado.
- **Panel de comparación**: "Compartidos" → "En común (≥2)" con texto explicativo contextual ("contribuyen a ≥2 repos/orgs seleccionadas").
- **Detalle de shared count**: en vez de "3 repos", ahora muestra "en 3 de 5 repos" para dar contexto del total analizado.
- **Margen inferior de gráficos**: aumentado (20 → 40px) para acomodar las etiquetas escalonadas.

## 6. Block UI y robustez de filtros

- **Block UI (pantalla de bloqueo)**: nueva overlay fullscreen (`z-index: 9998`) que se muestra durante operaciones pesadas — filtrado de datos (`isFiltering`) y carga de vistas personalizadas (`isLoadingViewData`). Bloquea toda interacción del usuario para evitar clicks compulsivos durante cargas. Estilo visual coherente con la pantalla de carga inicial (atom spinner orbital, scanlines CRT, fondo semi-transparente con `backdrop-filter: blur`). Mensaje contextual: "Filtrando datos del ecosistema..." / "Cargando vista personalizada...".
- **Prevención de condiciones de carrera en filtros**: añadido `AbortController` al `setFilter` del store. Si el usuario hace click rápido en múltiples filtros, la petición anterior se cancela antes de lanzar la nueva, evitando que resultados obsoletos sobrescriban datos más recientes.
- **Re-aplicación de filtros locales al cambiar filtros globales**: si el usuario tenía activo un `collabType` (ej: "Solo con commits") y hace click en una organización, el useEffect ahora detecta el cambio de filtro global y re-lanza la petición incluyendo el `collabType` activo. Antes, `setFilter` no incluía `collabType`/`includeBots` y el useEffect no se disparaba porque `localChanged` era false, dejando datos de colaboradores inconsistentes (bug reportado en la demo de Azure).
