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

- **Fondo → Vacío Cuántico.** El espacio de la escena no está vacío: contiene una rejilla-lattice y 400 partículas que parpadean aleatoriamente, representando las fluctuaciones del vacío predichas por la teoría cuántica de campos.

## Fenómenos cuánticos dinámicos

La visualización incorpora seis efectos animados basados en fenómenos cuánticos reales:

1. **Quantum Genesis.** Al iniciar la visualización, un destello central se expande simulando el Big Bang, seguido de la materialización secuenciada de los elementos del universo cuántico (vacío → procesadores → qubits → partículas → entrelazamiento).

2. **Principio de incertidumbre de Heisenberg.** Todos los qubits y partículas presentan micro-vibraciones continuas con frecuencias irracionales ($\pi$, $e$, $\varphi$), reflejando la imposibilidad de determinar simultáneamente posición y momento con precisión arbitraria ($\Delta x \cdot \Delta p \geq \hbar/2$).

3. **Efecto túnel cuántico.** Esferas luminosas viajan a lo largo de los canales de entrelazamiento con velocidad variable, atravesando el espacio entre entidades como fotones que cruzan barreras de potencial.

4. **Decoherencia cuántica.** Periódicamente, ondas expansivas circulares se propagan desde procesadores aleatorios, representando la pérdida de coherencia cuántica por interacción con el entorno.

5. **Destellos de entrelazamiento.** Cada $\sim$4.5 segundos, todas las partículas bridge emiten simultáneamente un pico de brillo (función $\cos^{30}(t)$), independientemente de su distancia, visualizando la correlación instantánea del entrelazamiento.

6. **Radiación de Hawking.** Micropartículas se emiten radialmente desde cada procesador, en analogía con la radiación térmica predicha por Hawking (1974) para agujeros negros.

## Interacción como observación cuántica

Las interacciones del usuario se modelan como actos de medición cuántica:

- **Colapso de la función de onda:** hacer clic en una entidad "colapsa" su superposición de estados, revelando información definida (panel de detalle) mientras la cámara hace zoom adaptativo según el tipo de entidad.

- **Decoherencia selectiva:** las entidades no relacionadas con la seleccionada reducen su opacidad al 6%, simulando cómo los grados de libertad no observados pierden coherencia en una medición cuántica parcial.

- **Orbitales de observación:** la entidad seleccionada se envuelve en tres anillos toroidales rotando a diferentes ángulos, representando las trayectorias de observación del estado cuántico.

## Implementación técnica

La visualización se implementa con **Three.js** a través de **React Three Fiber**, utilizando `InstancedMesh` para el renderizado eficiente de cientos de entidades en un único draw call por tipo. Los efectos de post-procesado se limitan a **Bloom** (luminancia aditiva) para mantener el rendimiento. La distribución espacial emplea un generador pseudoaleatorio con semilla fija (PRNG, semilla=42) que garantiza reproducibilidad entre sesiones, con un algoritmo de 60 candidatos por organización que maximiza la separación mínima entre entidades.

La animación de entrada se orquesta mediante un sistema de fases temporizadas (*Build Director*) que materializa los elementos siguiendo el frente de expansión del Genesis, aplicando funciones de *easing* elástico para simular la estabilización de un sistema cuántico alcanzando su estado fundamental.

---

*Sección preparada para la memoria del TFG — Grado en Ingeniería Informática, UCLM.*
