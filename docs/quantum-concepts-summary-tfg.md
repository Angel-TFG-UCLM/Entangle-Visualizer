# Metáfora Cuántica en la Visualización 3D de ENTANGLE

## Justificación de la metáfora

La visualización 3D de ENTANGLE emplea una metáfora basada en mecánica cuántica para representar el grafo de colaboración del ecosistema de software cuántico. Esta elección no es arbitraria: dado que el objeto de estudio del proyecto son repositorios de computación cuántica (Qiskit, Cirq, PennyLane, etc.), representar las relaciones de colaboración mediante analogías cuánticas establece un paralelismo coherente entre el *contenido* analizado y la *forma* en que se presenta.

## Mapeo de entidades

Cada tipo de nodo del grafo de colaboración se asocia a un concepto cuántico con justificación funcional:

- **Organizaciones → Procesadores Cuánticos.** Las organizaciones agrupan y coordinan repositorios, del mismo modo que un procesador cuántico aloja y opera sobre qubits. Se representan como toros rotando con un núcleo energético central.

- **Repositorios → Qubits.** Los repositorios son la unidad fundamental de información del ecosistema, equivalente al qubit como unidad de información cuántica. Se visualizan como esferas luminosas rodeadas de nubes de probabilidad (partículas orbitales) y ejes de Bloch.

- **Usuarios → Partículas Cuánticas.** Los desarrolladores son las partículas que interactúan con los qubits, posicionadas en distribución esférica uniforme alrededor de sus repositorios.

- **Bridge Users → Partículas Entrelazadas.** Los usuarios que contribuyen a repositorios de diferentes organizaciones se representan como partículas entrelazadas que emiten destellos sincronizados globalmente, visualizando la correlación no local del entrelazamiento cuántico (*spooky action at a distance*, Einstein, 1935).

- **Conexiones → Canales de Entrelazamiento.** Las relaciones de colaboración se representan como ondas sinusoidales animadas entre entidades, simulando la transmisión de información cuántica.

- **Fondo → Vacío Cuántico.** El espacio de la escena no está vacío: contiene espuma cuántica (200 partículas virtuales que parpadean), un campo de interferencia (rejilla de 4900 puntos con 5 fuentes de onda) y una esfera de Dyson geodésica (R=3500) que envuelve el universo visible.

## Fenómenos cuánticos dinámicos

La visualización incorpora ocho efectos animados basados en fenómenos cuánticos reales:

1. **Quantum Genesis.** Al iniciar la visualización, un destello central se expande simulando el Big Bang, seguido de la materialización secuenciada de los elementos del universo cuántico (vacío → procesadores → qubits → partículas → entrelazamiento).

2. **Principio de incertidumbre de Heisenberg.** Todos los qubits y partículas presentan micro-vibraciones continuas con frecuencias irracionales ($\pi$, $e$, $\varphi$), reflejando la imposibilidad de determinar simultáneamente posición y momento con precisión arbitraria ($\Delta x \cdot \Delta p \geq \hbar/2$).

3. **Efecto túnel cuántico.** Esferas luminosas viajan a lo largo de los canales de entrelazamiento con velocidad variable, atravesando el espacio entre entidades como fotones que cruzan barreras de potencial.

4. **Decoherencia cuántica.** Periódicamente, ondas expansivas circulares se propagan desde procesadores aleatorios, representando la pérdida de coherencia cuántica por interacción con el entorno.

5. **Destellos de entrelazamiento.** Cada $\sim$4.5 segundos, todas las partículas bridge emiten simultáneamente un pico de brillo (función $\cos^{30}(t)$), independientemente de su distancia, visualizando la correlación instantánea del entrelazamiento.

6. **Radiación de Hawking.** Micropartículas se emiten radialmente desde cada procesador, en analogía con la radiación térmica predicha por Hawking (1974) para agujeros negros.

7. **Rayos cósmicos.** Hasta 8 estrellas fugaces simultáneas con estela de cinta de 48 vértices y paleta de 6 colores (cian, magenta, dorado, verde, naranja, violeta). El 55% son rayos de escape (1000–1500 u/s hacia la Dyson Shell); el 45% son rayos normales (200–480 u/s cruzando el interior). Los rayos de escape que alcanzan R ≥ 3500 impactan contra la esfera geodésica, generando una onda de choque luminosa que se propaga por las aristas de la estructura con el color del rayo.

8. **Ondas gravitacionales.** Hasta 4 anillos concéntricos se propagan en el plano XZ desde las 8 organizaciones más grandes del ecosistema (los objetos más "masivos"), con velocidades de 28–43 u/s y radios de hasta 150 unidades, en azul profundo con blending aditivo.

## Efectos ambientales del vacío

Tres componentes adicionales llenan el "vacío cuántico" del universo:

- **Espuma cuántica (QuantumFoam).** 200 partículas distribuidas esféricamente (R=30–1000) que parpadean con ciclos de creación/aniquilación y jitter de Heisenberg (±2.5u), representando las fluctuaciones del vacío a escala de Planck.

- **Campo de interferencia (InterferenceGrid).** Rejilla de 70×70 = 4900 puntos en el plano XZ (Y=−50) con 5 fuentes de onda en movimiento que generan un patrón de interferencia cambiante tricolor (verde/violeta/cian), visualizando la superposición de funciones de onda de probabilidad.

- **Esfera de Dyson (ElectronOrbits).** Icosaedro subdividido 4 veces (~1280 triángulos) a R=3500, formando la frontera geodésica del universo. 12 pulsos de energía viajan por sus aristas. Cuando un rayo cósmico impacta, se genera una onda de choque gaussiana (σ=400, v=1500 u/s) y un flash en el epicentro (σ=500), ambos heredando el color del rayo.

## Interacción como observación cuántica

Las interacciones del usuario se modelan como actos de medición cuántica:

- **Colapso de la función de onda:** hacer clic en una entidad "colapsa" su superposición de estados, revelando información definida (panel de detalle con tooltips de radar específicos por tipo) mientras la cámara vuela con offsets pre-asignados por entidad (user: 4/2.5/4, repo: 10/6/10, org: 18/10/18).

- **Decoherencia selectiva:** las entidades no relacionadas con la seleccionada reducen su opacidad al 6%, y los impactos de la Dyson Shell se atenúan al 85%. Un sistema de `strictHoverBlock` permite navegación libre con hover incluso con una entidad seleccionada; el bloqueo solo se aplica con filtros/lentes/búsquedas activas.

- **Orbitales de observación:** la entidad seleccionada se envuelve en tres anillos toroidales rotando a diferentes ángulos, representando las trayectorias de observación del estado cuántico.

## Tour Cósmico

Un sistema de recorrido guiado automatizado que actúa como "tomografía cuántica" del ecosistema:

- **Auto-Tour:** si está habilitado, se inicia automáticamente ~8.8 segundos después del Big Bang, una vez completada la materialización.
- **Waypoints narrativos:** la cámara visita secuencialmente las distintas regiones del universo con interpolación suave y órbita cinemática.
- **Post-tour:** al completarse, la cámara entra en modo panorámico orbital (radio 620, altura 280).
- El usuario puede interrumpir el tour en cualquier momento interactuando con el canvas.

## Modo Simple

Toggle accesible desde Ajustes que desactiva los 6 efectos ambientales decorativos (CosmicRays, Dyson Shell, GravitationalWaves, QuantumFoam, InterferenceGrid, InterferenceField), manteniendo todos los componentes con datos reales. Equivale a enfriar el sistema cuántico hasta que solo los estados fundamentales (datos) son visibles.

## Implementación técnica

La visualización se implementa con **Three.js** a través de **React Three Fiber**, utilizando `InstancedMesh` para el renderizado eficiente de cientos de entidades en un único draw call por tipo. Los efectos de post-procesado se limitan a **Bloom** (luminancia aditiva) para mantener el rendimiento. La distribución espacial emplea un generador pseudoaleatorio con semilla fija (PRNG, semilla=42) que garantiza reproducibilidad entre sesiones, con un algoritmo de 60 candidatos por organización que maximiza la separación mínima entre entidades.

La animación de entrada se orquesta mediante un sistema de fases temporizadas (*Build Director*) que materializa los elementos siguiendo el frente de expansión del Genesis, aplicando funciones de *easing* elástico para simular la estabilización de un sistema cuántico alcanzando su estado fundamental.

Las optimizaciones de rendimiento incluyen: tooltips sin re-renders (manipulación directa del DOM via `useRef`), vuelo de cámara con `Vector3` pre-asignados y supresión de `ViewportLabels` durante la animación (`cameraFlyingRef`), transiciones CSS específicas (no `transition: all`) con promoción GPU (`will-change`), y hitboxes calibrados con umbral de visibilidad mínimo de 0.4 para evitar selecciones accidentales de entidades atenuadas.

---

*Sección preparada para la memoria del TFG — Grado en Ingeniería Informática, UCLM.*
