# ENTANGLE Quantum Field — Documentación de Conceptos Cuánticos

## Índice

1. [Introducción](#1-introducción)
2. [Metáfora Cuántica: Mapeo Entidades → Física](#2-metáfora-cuántica-mapeo-entidades--física)
3. [Conceptos Cuánticos Aplicados](#3-conceptos-cuánticos-aplicados)
   - 3.1 [Procesadores Cuánticos (Organizaciones)](#31-procesadores-cuánticos-organizaciones)
   - 3.2 [Qubits (Repositorios)](#32-qubits-repositorios)
   - 3.3 [Partículas Cuánticas (Usuarios)](#33-partículas-cuánticas-usuarios)
   - 3.4 [Partículas Entrelazadas (Bridge Users)](#34-partículas-entrelazadas-bridge-users)
   - 3.5 [Canales de Entrelazamiento (Conexiones)](#35-canales-de-entrelazamiento-conexiones)
   - 3.6 [Vacío Cuántico (Fondo)](#36-vacío-cuántico-fondo)
4. [Fenómenos Cuánticos Dinámicos](#4-fenómenos-cuánticos-dinámicos)
   - 4.1 [Quantum Genesis (Big Bang Inicial)](#41-quantum-genesis-big-bang-inicial)
   - 4.2 [Principio de Incertidumbre de Heisenberg](#42-principio-de-incertidumbre-de-heisenberg)
   - 4.3 [Efecto Túnel Cuántico (Tunneling Pulses)](#43-efecto-túnel-cuántico-tunneling-pulses)
   - 4.4 [Decoherencia Cuántica (Shockwaves)](#44-decoherencia-cuántica-shockwaves)
   - 4.5 [Entrelazamiento Cuántico (Sync Flashes)](#45-entrelazamiento-cuántico-sync-flashes)
   - 4.6 [Radiación de Hawking](#46-radiación-de-hawking)
5. [Elementos Visuales Estáticos](#5-elementos-visuales-estáticos)
   - 5.1 [Nubes de Probabilidad](#51-nubes-de-probabilidad)
   - 5.2 [Ejes de Bloch](#52-ejes-de-bloch)
   - 5.3 [Anillos de Energía](#53-anillos-de-energía)
   - 5.4 [Patrón de Interferencia](#54-patrón-de-interferencia)
6. [Interacciones del Usuario como Fenómenos Cuánticos](#6-interacciones-del-usuario-como-fenómenos-cuánticos)
   - 6.1 [Colapso de la Función de Onda (Click/Selección)](#61-colapso-de-la-función-de-onda-clickselección)
   - 6.2 [Dimming Selectivo (Decoherencia del Entorno)](#62-dimming-selectivo-decoherencia-del-entorno)
   - 6.3 [Anillos de Selección (Observación Cuántica)](#63-anillos-de-selección-observación-cuántica)
7. [Implementación Técnica](#7-implementación-técnica)
8. [Glosario de Términos Cuánticos](#8-glosario-de-términos-cuánticos)

---

## 1. Introducción

ENTANGLE Quantum Field es la visualización 3D interactiva del proyecto ENTANGLE, que analiza ecosistemas de software cuántico a través de la colaboración entre organizaciones, repositorios y desarrolladores en GitHub. La visualización emplea una **metáfora cuántica completa** donde cada elemento del grafo de colaboración se mapea a un concepto de la mecánica cuántica, creando una coherencia temática total con el dominio del proyecto: la computación cuántica.

La elección de esta metáfora no es casual. ENTANGLE estudia repositorios de software cuántico (Qiskit, Cirq, PennyLane, etc.), por lo que representar las relaciones de colaboración como fenómenos cuánticos crea un paralelismo conceptual entre el *contenido* que se analiza y la *forma* en que se visualiza.

---

## 2. Metáfora Cuántica: Mapeo Entidades → Física

| Entidad del Grafo | Concepto Cuántico | Representación Visual | Justificación |
|---|---|---|---|
| **Organización** | Procesador Cuántico | Toros de energía rotando (aceleradores de partículas) | Las organizaciones son los "procesadores" que ejecutan la computación cuántica del ecosistema |
| **Repositorio** | Qubit | Esferas luminosas con nubes de probabilidad | Los repos son la unidad fundamental de información, como el qubit es la unidad de información cuántica |
| **Usuario** | Partícula Cuántica | Esferas pequeñas orbitando qubits | Los desarrolladores son las partículas que interactúan con los qubits |
| **Bridge User** | Partícula Entrelazada | Esferas doradas con pulso sincronizado | Los bridge users conectan múltiples repositorios, como partículas entrelazadas comparten estado |
| **Conexión** | Canal de Entrelazamiento | Ondas sinusoidales entre entidades | Las colaboraciones forman canales cuánticos por donde fluye información |
| **Fondo** | Vacío Cuántico | Lattice hexagonal + fluctuaciones | El espacio vacío no está vacío: tiene estructura y fluctuaciones virtuales |
| **Click** | Colapso de función de onda | Zoom + highlight + panel de detalle | Observar una entidad "colapsa" su estado, revelando información definida |

---

## 3. Conceptos Cuánticos Aplicados

### 3.1 Procesadores Cuánticos (Organizaciones)

**Concepto real:** Un procesador cuántico es el hardware que manipula qubits para realizar cómputos cuánticos. Empresas como IBM (Heron), Google (Sycamore) o IonQ construyen procesadores con diferentes arquitecturas.

**Aplicación en ENTANGLE:**
- **Geometría:** Doble toro rotando — el toro principal (r=2.8) simula el acelerador de partículas que confina los qubits, y un segundo toro perpendicular (r=4) representa órbitas cruzadas de control.
- **Núcleo energético:** Una esfera brillante central (r=0.9) representa la fuente de energía del procesador.
- **Rotación continua:** Los toros rotan a velocidades ligeramente diferentes por organización, representando la operación activa del procesador. Velocidades: `0.3 + i * 0.05` rad/s.
- **Color:** Cyan (#00f7ff) con multiplicador de luminancia ×2-3, provocando bloom (halo lumínico) que simula la emisión energética.
- **Distribución:** Algoritmo de 60 candidatos con selección por máxima separación mínima, con alturas asimétricas. Distancia mínima entre procesadores: 140 unidades, máxima: 320.

### 3.2 Qubits (Repositorios)

**Concepto real:** El qubit (quantum bit) es la unidad fundamental de información cuántica. A diferencia del bit clásico (0 o 1), un qubit puede existir en una superposición de ambos estados simultáneamente, representada como |ψ⟩ = α|0⟩ + β|1⟩.

**Aplicación en ENTANGLE:**
- **Geometría:** Esferas (r=0.55) de color violeta (#bd00ff) que representan el estado cuántico del qubit.
- **Escala variable:** El tamaño depende de la popularidad del repositorio (estrellas en GitHub): `scale = clamp(stars/800, 0.7, 1.5)`. Los repositorios más populares son qubits con mayor amplitud de probabilidad.
- **Ejes de Bloch:** Líneas verticales que atraviesan cada qubit, representando el eje |0⟩↔|1⟩ de la esfera de Bloch. Altura proporcional a la escala del qubit: `1.8 × scale`.
- **Nubes de probabilidad:** 10 partículas orbitando cada qubit en distribución esférica gaussiana (radio 1.2-3.0), que representan la distribución de probabilidad |ψ|² del estado cuántico.
- **Distribución orbital:** Cada qubit orbita su procesador padre a distancias variables (18-55 unidades) con jitter angular y tilt 3D (±36°), evitando distribuciones simétricas.

### 3.3 Partículas Cuánticas (Usuarios)

**Concepto real:** Las partículas subatómicas (electrones, fotones, neutrinos) interactúan con los qubits durante la computación cuántica. Su comportamiento es probabilístico y están sujetas al principio de incertidumbre de Heisenberg.

**Aplicación en ENTANGLE:**
- **Geometría:** Esferas pequeñas (r=0.25) de color verde (#00ff9f).
- **Distribución esférica:** Cada usuario se posiciona en una distribución uniforme sobre una esfera (usando φ = arccos(2r-1)) alrededor de su qubit/repositorio, a distances entre 3-7 unidades.
- **Instanced rendering:** Todas las partículas normales se renderizan en un único `InstancedMesh` para maximizar rendimiento GPU.
- **Micro-vibración (Heisenberg):** Cada partícula vibra sutilmente con frecuencias únicas (ver sección 4.2).

### 3.4 Partículas Entrelazadas (Bridge Users)

**Concepto real:** El entrelazamiento cuántico (quantum entanglement) es un fenómeno donde dos o más partículas quedan correlacionadas de tal forma que el estado cuántico de una no puede describirse independientemente del estado de las otras, sin importar la distancia que las separe. Albert Einstein lo llamó "spooky action at a distance" (acción fantasmagórica a distancia).

**Aplicación en ENTANGLE:**
- **Identificación:** Un bridge user es un desarrollador que contribuye a repositorios de diferentes organizaciones, "conectando" ecosistemas separados — análogo a una partícula entrelazada que conecta sistemas cuánticos distantes.
- **Geometría:** Esferas (r=0.25) de color dorado (#ffbd00) con multiplicador ×2.5 para mayor brillo.
- **Pulsación sincronizada:** Tras materializarse, las partículas bridge pulsan entre escala 0.9 y 1.5 sinusoidalmente: `1.2 + sin(t*3) * 0.3`. Esta pulsación es idéntica para todas las partículas bridge.
- **Entanglement Sync Flash:** Cada ~4.5 segundos, TODAS las partículas bridge emiten simultáneamente un destello (escala +1.0) usando una función de pico ultra-estrecho: `cos(t*1.4)^30`. Este flash sincronizado sin importar la distancia visualiza el fenómeno de "spooky action at a distance".

### 3.5 Canales de Entrelazamiento (Conexiones)

**Concepto real:** En telecomunicaciones cuánticas, un canal de entrelazamiento (entanglement channel) es el medio por el cual se transmite información cuántica entre dos partes. La distribución de entrelazamiento (entanglement distribution) es un recurso fundamental en redes cuánticas.

**Aplicación en ENTANGLE:**
- **Geometría:** Puntos distribuidos a lo largo de una trayectoria sinusoidal entre dos entidades conectadas, simulando una onda cuántica. 20 puntos por conexión.
- **Forma de onda:** `sin(t × π × 3)` multiplicado por una amplitud proporcional a la distancia (4% de la longitud, max 2.0 unidades).
- **Animación:** La onda se desplaza temporalmente (`+ t*3` en la fase) creando el efecto de propagación de información cuántica.
- **Color:** Dorado (#ffbd00) con blending aditivo, evocando la transferencia de energía.

### 3.6 Vacío Cuántico (Fondo)

**Concepto real:** En teoría cuántica de campos, el vacío cuántico no es un espacio verdaderamente vacío. Está lleno de fluctuaciones del vacío: pares partícula-antipartícula virtuales que aparecen y desaparecen continuamente debido al principio de incertidumbre energía-tiempo (ΔE·Δt ≥ ℏ/2).

**Aplicación en ENTANGLE:**
- **Quantum Lattice:** Una rejilla de líneas cyan en el plano XZ (y=-50) con paso de 30 unidades y extensión de 800×800, que representa la estructura fundamental del espacio-tiempo cuántico. Opacidad muy baja (2.5%) para no interferir con la escena.
- **Fluctuaciones del vacío:** 400 partículas distribuidas en un volumen de 600×400×600 que parpadean aleatoriamente siguiendo funciones sinusoidales con fases únicas: `sin(t × (0.5 + seed×2) + phase)`. Simulan la creación y aniquilación de pares virtuales.
- **Patrón de interferencia:** 600 partículas adicionales en un plano trasero (z=-200) que forman un patrón tipo doble rendija: `cos(x × 0.15 + t × 0.5)²`. Referencia directa al experimento de la doble rendija, piedra angular de la mecánica cuántica.

---

## 4. Fenómenos Cuánticos Dinámicos

### 4.1 Quantum Genesis (Big Bang Inicial)

**Concepto real:** La cosmología cuántica propone que el Big Bang fue un evento cuántico donde toda la materia y energía del universo emergió de una singularidad. Las teorías de inflación cósmica describen una expansión exponencial en los primeros 10⁻³⁶ segundos.

**Aplicación en ENTANGLE:**
- **Flash central:** Al abrir la visualización, una esfera blanco-azulada (#88ccff ×5) aparece en el centro y se expande rápidamente (escala 0→18 en 0.67s con easeOutCubic) mientras se desvanece, simulando el destello del Big Bang.
- **Onda expansiva:** Simultáneamente, un icosaedro wireframe (#00f7ff) se expande hasta radio 450 unidades, representando el frente de onda de la inflación cósmica.
- **Secuenciación:** El Genesis ocurre en los primeros 2 segundos (PHASE_TIMINGS[genesis] = [0.0, 2.0]). Los demás elementos se materializan siguiendo el frente de onda: vacío (0.3s), procesadores (1.5s), qubits (2.8s), partículas (4.2s), entrelazamiento (5.5s).

### 4.2 Principio de Incertidumbre de Heisenberg

**Concepto real:** El principio de incertidumbre de Heisenberg (1927) establece que no es posible determinar simultáneamente y con precisión arbitraria la posición y el momento de una partícula: Δx·Δp ≥ ℏ/2. A nivel subatómico, las partículas no tienen posiciones definidas — siempre hay una incertidumbre irreducible.

**Aplicación en ENTANGLE:**
- **Qubits:** Cada qubit vibra con frecuencias únicas basadas en su índice:
  ```
  Δx = sin(t × 1.7 + i × 3.14) × 0.04
  Δy = cos(t × 2.3 + i × 2.71) × 0.04
  Δz = sin(t × 1.9 + i × 1.62) × 0.04
  ```
  Las constantes multiplicadoras (3.14 ≈ π, 2.71 ≈ e, 1.62 ≈ φ) son irracionales para evitar patrones repetitivos.
- **Partículas (users):** Vibración similar pero con amplitud menor (±0.03) y frecuencias ligeramente diferentes, reflejando que partículas más ligeras tienen mayor incertidumbre posicional relativa.
- **Efecto visual:** El micro-temblor es sutil (sub-píxel a distancia) pero da organicidad a la escena, evitando la rigidez de posiciones fijas.

### 4.3 Efecto Túnel Cuántico (Tunneling Pulses)

**Concepto real:** El efecto túnel cuántico (quantum tunneling) permite a una partícula atravesar una barrera de potencial que, en mecánica clásica, sería infranqueable. Este fenómeno es fundamental en semiconductores (diodos túnel), microscopía de efecto túnel (STM) y fusión nuclear estelar.

**Aplicación en ENTANGLE:**
- **Fotones viajeros:** Hasta 25 esferas doradas brillantes (#ffbd00 ×4) viajan continuamente a lo largo de los canales de entrelazamiento, siguiendo la misma trayectoria sinusoidal que los canales.
- **Velocidad variable:** Cada pulso tiene velocidad única: `0.15 + random() × 0.12` unidades/s.
- **Intensidad por posición:** El tamaño del pulso varía según su posición en el canal: máximo en el centro, mínimo en los extremos, siguiendo `sin(t × π)` — análogo a cómo la amplitud de la función de onda varía dentro de la barrera.
- **Salto entre canales:** Al completar un recorrido, el pulso salta a un canal aleatorio diferente, simulando la naturaleza no determinista del tunneling.

### 4.4 Decoherencia Cuántica (Shockwaves)

**Concepto real:** La decoherencia cuántica es la pérdida de la superposición cuántica debido a la interacción con el entorno. Es el principal obstáculo para construir computadores cuánticos prácticos: el qubit pierde su estado cuántico al interactuar con el ruido térmico, radiación electromagnética o vibraciones mecánicas. El tiempo de coherencia (T₂) mide cuánto tiempo un qubit mantiene su estado.

**Aplicación en ENTANGLE:**
- **Ondas de decoherencia:** Cada 8-14 segundos, un procesador cuántico aleatorio emite una onda expansiva circular cyan (#00f7ff) que se propaga radialmente.
- **Dinámica:** La onda se expande con easeOutCubic hasta radio 90 unidades en 3.5 segundos, mientras su opacidad decae como `(1-t/T)²`, simulando cómo la información cuántica se disipa exponencialmente.
- **Máximo simultaneo:** 3 ondas pueden coexistir, representando eventos de decoherencia independientes en diferentes procesadores.
- **Significado narrativo:** Visualmente comunica que el ecosistema de software cuántico es dinámico y que los procesadores están activamente operando (y sufriendo decoherencia real durante la computación).

### 4.5 Entrelazamiento Cuántico (Sync Flashes)

**Concepto real:** Cuando dos partículas están entrelazadas, medir el estado de una determina instantáneamente el estado de la otra, independientemente de la distancia. Esto no viola la relatividad porque no se transmite información utilizable más rápido que la luz (teorema de no-comunicación). El entrelazamiento fue verificado experimentalmente violando las desigualdades de Bell (Alain Aspect, 1982; Nobel de Física 2022).

**Aplicación en ENTANGLE:**
- **Destello sincronizado:** Todas las partículas bridge del ecosistema emiten simultáneamente un pico de brillo/escala cada ~4.5 segundos.
- **Función de pico:** `cos(t × 1.4)^30` genera un pico ultra-estrecho (duración visual ~0.1s) que crea un "flash" instantáneo global, visualizando la correlación instantánea independiente de la distancia.
- **Significado:** Los bridge users están "entrelazados" porque su contribución a múltiples repositorios los correlaciona — un cambio en un repositorio puede propagarse instantáneamente a través de estos usuarios puente.

### 4.6 Radiación de Hawking

**Concepto real:** Stephen Hawking predijo en 1974 que los agujeros negros no son completamente negros: emiten radiación térmica (radiación de Hawking) debido a efectos cuánticos cerca del horizonte de eventos. El mecanismo involucra la creación de pares partícula-antipartícula virtuales en el vacío cuántico, donde una partícula escapa y la otra cae al agujero negro.

**Aplicación en ENTANGLE:**
- **Micropartículas:** 12 partículas diminutas (tamaño 0.08) por procesador cuántico se emiten radialmente en direcciones esféricas aleatorias.
- **Dinámica:** Cada partícula se aleja del procesador a velocidades variables (0.3-0.8 u/s) hasta un radio máximo (14-24 unidades), donde se recicla — simulando la emisión continua de radiación.
- **Color:** Cyan (#00f7ff ×1.2) con blending aditivo y opacidad baja (0.3), creando un halo tenue que rodea cada procesador.
- **Significado:** Los procesadores cuánticos (organizaciones) no son sistemas cerrados — emiten "radiación" en forma de contribuciones open source, documentación, y conocimiento que irradia más allá de sus límites organizacionales.

---

## 5. Elementos Visuales Estáticos

### 5.1 Nubes de Probabilidad

**Concepto real:** La función de onda |ψ|² describe la distribución de probabilidad de encontrar una partícula en una posición dada. En el modelo atómico, los orbitales electrónicos (s, p, d, f) son nubes de probabilidad con formas características.

**Implementación:** 10 partículas por qubit distribuidas esféricamente con animación orbital continua. La distribución sigue φ = arccos(2r-1) para uniformidad sobre la esfera.

### 5.2 Ejes de Bloch

**Concepto real:** La esfera de Bloch es una representación geométrica del espacio de estados de un qubit. El eje Z conecta |0⟩ (polo norte) con |1⟩ (polo sur).

**Implementación:** Líneas verticales visibles pero con opacidad muy baja (15%), que indican el eje computacional de cada qubit.

### 5.3 Anillos de Energía

**Concepto real:** Los procesadores cuánticos requieren pulsos de microondas para manipular qubits. Estos pulsos se propagan como ondas desde el procesador.

**Implementación:** Anillos que se expanden desde cada procesador con opacidad decreciente y escala creciente (hasta ×6), reciclándose cíclicamente.

### 5.4 Patrón de Interferencia

**Concepto real:** El experimento de la doble rendija demuestra la dualidad onda-partícula. Las partículas cuánticas producen un patrón de franjas de interferencia al pasar por dos rendijas.

**Implementación:** 600 partículas en un plano trasero cuya distribución sigue `cos²(x × 0.15 + t)`, recreando el patrón de bandas brillantes y oscuras alternadas.

---

## 6. Interacciones del Usuario como Fenómenos Cuánticos

### 6.1 Colapso de la Función de Onda (Click/Selección)

**Concepto real:** En la interpretación de Copenhague, el acto de medir (observar) un sistema cuántico causa el "colapso" de su función de onda, pasando de una superposición de estados a un estado definido. Antes de la medición, el sistema existe en todos los estados posibles simultáneamente.

**Aplicación:** Hacer click en cualquier entidad es un acto de "observación" que colapsa su estado: la cámara hace zoom adaptativo (distancia según tipo: user=4, repo=10, org=18), el panel de detalle revela información concreta, y las entidades no relacionadas se atenúan.

### 6.2 Dimming Selectivo (Decoherencia del Entorno)

**Concepto real:** Al observar un subsistema cuántico, los grados de libertad no observados se "desacoplan" — un efecto de la decoherencia ambiental que reduce el estado cuántico global a un estado mixto donde solo el subsistema observado mantiene coherencia.

**Aplicación:** Al seleccionar una entidad, se calcula el conjunto de IDs relacionados (la org + sus repos + sus usuarios, recursivamente). Las entidades *no* relacionadas reducen su opacidad al 6-8%, simulando la decoherencia de los estados no observados. Los canales de entrelazamiento y nubes de probabilidad también se atenúan globalmente.

### 6.3 Anillos de Selección (Observación Cuántica)

**Concepto real:** En la representación visual de estados cuánticos, los orbitales se muestran como trayectorias circulares o toroidales que describen la evolución temporal del estado observado.

**Aplicación:** Tres toros concéntricos a diferentes ángulos rotan alrededor de la entidad seleccionada, con un pulso suave de escala (±8%). El tamaño se adapta al tipo de entidad: 5.5 (org), 2.8 (repo), 1.6 (user). El color coincide con el de la entidad.

---

## 7. Implementación Técnica

### Stack tecnológico
- **Three.js** — Motor 3D WebGL
- **React Three Fiber** — Binding declarativo React ↔ Three.js
- **@react-three/drei** — Helpers (OrbitControls, Html)
- **@react-three/postprocessing** — Efectos de post-procesado (Bloom)
- **Zustand** — Estado global del dashboard

### Optimizaciones de rendimiento
- **InstancedMesh:** Qubits, partículas normales y bridge se renderizan como instancias GPU — un único draw call por tipo en vez de cientos.
- **BufferGeometry + bufferAttribute:** Fluctuaciones, nubes, interferencia y canales usan geometría programática directa — mínimo overhead JS.
- **Materiales compartidos:** geometrías y materiales se crean una vez con `useMemo()` y se reusan.
- **Blending aditivo:** Los efectos luminosos usan `THREE.AdditiveBlending` en vez de transparency estándar, reduciendo el overhead de sorting.
- **Hitboxes invisibles:** Esferas transparentes de mayor tamaño que las entidades facilitan el click sin coste de render visible.

### Animación secuenciada (Build Director)
```
genesis:      [0.0s,  2.0s]  // Flash + onda expansiva
vacuum:       [0.3s,  1.5s]  // Lattice + fluctuaciones
processors:   [1.5s,  1.8s]  // Procesadores cuánticos
qubits:       [2.8s,  2.0s]  // Qubits materializan
particles:    [4.2s,  1.5s]  // Partículas orbitan
entanglement: [5.5s,  1.8s]  // Canales se dibujan
```

### Layout orgánico (distribución no simétrica)
- **PRNG con semilla (42):** Reproducibilidad visual entre sesiones.
- **Algoritmo de 60 candidatos:** Para cada org, se generan 60 posiciones aleatorias y se selecciona la de mayor distancia mínima a las ya colocadas.
- **Jitter angular y tilt 3D:** Los repos no se distribuyen en anillo plano sino con inclinación variable (±36°) y perturbación angular.
- **Distribución esférica uniforme:** Los usuarios se posicionan usando φ = arccos(2r-1), que produce distribución uniforme sobre la esfera.

### Funciones de easing
- **easeOutCubic:** `1 - (1-t)³` — Materialización suave de fondo y fluctuaciones.
- **easeOutElastic:** Bounce de "resolución cuántica" para procesadores y qubits, simulando la estabilización de un sistema cuántico alcanzando su estado base.

---

## 8. Glosario de Términos Cuánticos

| Término | Definición | Uso en ENTANGLE |
|---|---|---|
| **Qubit** | Unidad fundamental de información cuántica, superposición de |0⟩ y |1⟩ | Repositorios |
| **Entrelazamiento** | Correlación cuántica no local entre partículas | Conexiones entre repos vía bridge users |
| **Superposición** | Estado que existe en múltiples valores simultáneamente | Entidades no seleccionadas (todos los estados posibles) |
| **Colapso de función de onda** | Resolución de superposición al medir/observar | Click del usuario sobre una entidad |
| **Decoherencia** | Pérdida de coherencia cuántica por interacción con el entorno | Dimming de entidades no relacionadas / ondas expansivas |
| **Principio de incertidumbre** | Imposibilidad de conocer posición y momento simultáneamente con precisión infinita | Micro-vibración de todas las entidades |
| **Efecto túnel** | Partícula atravesando una barrera de potencial clásicamente imposible | Pulsos viajando por canales de entrelazamiento |
| **Radiación de Hawking** | Emisión de radiación por agujeros negros | Micropartículas escapando de procesadores |
| **Esfera de Bloch** | Representación geométrica del estado de un qubit | Ejes verticales a través de cada qubit |
| **Vacío cuántico** | Estado de energía mínima que contiene fluctuaciones | Lattice de fondo + partículas virtuales |
| **Doble rendija** | Experimento fundamental que demuestra la dualidad onda-partícula | Patrón de interferencia en el plano trasero |
| **Procesador cuántico** | Hardware que manipula qubits | Toros rotando (organizaciones) |
| **Canal de entrelazamiento** | Medio de transmisión de información cuántica | Ondas sinusoidales entre entidades |
| **Diagramas de Feynman** | Representación gráfica de interacciones entre partículas | Estelas de partículas |
| **Inflación cósmica** | Expansión exponencial del universo primitivo | Onda expansiva del Genesis |

---

*Documento generado para el proyecto ENTANGLE — TFG, Grado en Ingeniería Informática, Universidad de Castilla-La Mancha.*
