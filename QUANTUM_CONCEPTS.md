# Conceptos de Mecánica Cuántica en ENTANGLE

> Glosario de los conceptos físicos reales en los que se basan los elementos visuales del dashboard.

---

## 1. Qubit

Unidad básica de información cuántica, análoga al bit clásico. Mientras un bit solo puede ser 0 o 1, un qubit puede estar en **superposición** de ambos estados simultáneamente. Se representa como un sistema de dos niveles: |0⟩ y |1⟩.

**En ENTANGLE →** En la esquina superior derecha del header se muestra un badge con notación qubit: |1⟩ cuando el backend responde (verde, estado excitado) y |0⟩ cuando está caído (rojo, estado fundamental). Mientras se comprueba la conexión, el badge muestra α|0⟩+β|1⟩ con una animación pulsante, indicando que el estado aún no ha sido "medido".

---

## 2. Superposición cuántica

Un sistema cuántico puede existir en múltiples estados a la vez hasta que se realiza una medición. El estado general de un qubit en superposición se escribe:

$$|\psi\rangle = \alpha|0\rangle + \beta|1\rangle$$

donde α y β son amplitudes de probabilidad complejas que satisfacen |α|² + |β|² = 1.

**En ENTANGLE →** El título "ENTANGLE" en el header muestra un sutil halo cian/púrpura que oscila lentamente a su alrededor, como si la palabra existiera simultáneamente en varias posiciones ligeramente desplazadas. Son dos copias borrosas del texto que se mueven en direcciones opuestas, simulando la coexistencia de estados. Además, las tarjetas KPI muestran una onda sinusoidal distribuida (el estado en superposición) que solo colapsa a un punto definido cuando el usuario pasa el cursor.

---

## 3. Colapso de la función de onda

Al medir un sistema en superposición, este deja de estar en múltiples estados y pasa instantáneamente a un único estado definido. La distribución de probabilidad |ψ(x)|² se convierte en una delta de Dirac δ(x) centrada en el valor medido.

**En ENTANGLE →** En la esquina inferior derecha de cada tarjeta KPI se ve una onda sinusoidal suave con envolvente gaussiana (la función de onda antes de medir). Al pasar el cursor sobre la tarjeta, la onda desaparece y es sustituida por un pico estrecho y puntiagudo con un punto brillante en la cima: el "colapso" a un valor definido. Al retirar el cursor, la onda vuelve a aparecer. Además, al pasar el cursor sobre los gráficos, los tooltips muestran el icono ⊕ y el texto "medición colapsada", reforzando la metáfora.

---

## 4. Notación de Dirac (bra-ket)

Notación estándar en mecánica cuántica inventada por Paul Dirac:

- **Ket** |ψ⟩ → representa un estado cuántico (vector columna).
- **Bra** ⟨ψ| → representa el dual del estado (vector fila conjugado).
- **Bracket** ⟨φ|ψ⟩ → producto interno entre dos estados (probabilidad de transición).

**En ENTANGLE →** Esta notación aparece de forma recurrente en toda la interfaz: las posiciones en las tablas de ranking se muestran como |1⟩, |2⟩, |3⟩… en lugar de simples números; cuando hay filtros activos aparece un badge animado con el texto |FILTERED⟩; cada tarjeta KPI muestra un tenue |ψ⟩ en su esquina superior derecha; y los tooltips de los gráficos presentan los valores como ⟨nombre| = valor, usando la notación "bra" para expresar el resultado de una medición.

---

## 5. Función de onda ψ(x)

Función matemática que describe completamente el estado de una partícula cuántica. Su módulo al cuadrado |ψ(x)|² da la densidad de probabilidad de encontrar la partícula en la posición x.

**En ENTANGLE →** Entre cada sección del dashboard hay separadores animados que sustituyen a las líneas horizontales convencionales. Consisten en dos curvas sinusoidales superpuestas con gradiente cian→púrpura que fluyen horizontalmente, con pequeños puntos pulsantes a lo largo de la onda que representan los nodos (puntos donde la probabilidad es cero). Además, la onda del WavefunctionCollapse en las tarjetas KPI lleva la etiqueta |ψ|² indicando que representa la densidad de probabilidad.

---

## 6. Entrelazamiento cuántico

Fenómeno donde dos partículas quedan correlacionadas de tal forma que el estado de una determina instantáneamente el estado de la otra, sin importar la distancia que las separe. Einstein lo llamó "acción fantasmagórica a distancia".

**En ENTANGLE →** El fondo animado del dashboard muestra decenas de partículas de colores moviéndose libremente. Periódicamente (cada ~4 segundos) aparecen curvas brillantes que conectan instantáneamente dos partículas muy alejadas entre sí: estos flashes representan la correlación instantánea del entrelazamiento, independiente de la distancia. Además, junto al subtítulo del header hay dos pequeños puntos (uno cian, otro púrpura) que pulsan en alternancia, representando un par de partículas entrelazadas (par EPR) cuyo estado siempre está correlacionado.

---

## 7. Esfera de Bloch

Representación geométrica del estado de un qubit como un punto en la superficie de una esfera unitaria. El polo norte es |0⟩, el polo sur es |1⟩, y cualquier punto intermedio es una superposición. Las coordenadas esféricas (θ, φ) determinan las amplitudes α y β.

**En ENTANGLE →** A ambos lados de la ecuación de Schrödinger en la sección hero se muestran dos esferas semitransparentes con gradiente cian→púrpura. Cada una tiene un eje vertical marcado con |0⟩ arriba y |1⟩ abajo, una elipse ecuatorial que gira continuamente (representando las rotaciones en el plano XY), y una flecha desde el centro a la superficie con un punto brillante pulsante en la punta: el vector que indica el estado actual del qubit.

---

## 8. Ecuación de Schrödinger

Ecuación fundamental que gobierna la evolución temporal de cualquier sistema cuántico:

$$i\hbar \frac{\partial|\psi\rangle}{\partial t} = \hat{H}|\psi\rangle$$

donde ℏ es la constante de Planck reducida y Ĥ es el operador Hamiltoniano (energía total del sistema).

**En ENTANGLE →** En la parte superior del dashboard, centrada entre las dos esferas de Bloch, se muestra la ecuación en tipografía monospace con color cian tenue. Actúa como elemento decorativo que establece el fundamento teórico del proyecto: toda la dinámica cuántica se rige por esta ecuación.

---

## 9. Operadores cuánticos

En mecánica cuántica, las magnitudes físicas se representan como operadores matemáticos que actúan sobre los estados:

- **Ĥ** (Hamiltoniano) → energía total del sistema.
- **σ̂** (Pauli) → conjunto de tres matrices (σₓ, σᵧ, σᵤ) que describen rotaciones del qubit.
- **Û** → operador unitario de evolución temporal.
- **Ψ̂** → operador de campo cuántico.

**En ENTANGLE →** En la esquina inferior derecha de cada tarjeta de gráfico aparece un símbolo de operador cuántico casi transparente (opacidad ~6%) que se hace más visible al pasar el cursor (~18%). Las tres tarjetas de gráficos muestran Ĥ, σ̂ y Û respectivamente, y el contenedor del grafo de red muestra Ψ̂. Son marcas de agua sutiles que recuerdan que cada visualización representa una "operación" sobre los datos cuánticos.

---

## 10. Puertas cuánticas

Operaciones básicas sobre qubits, análogas a las puertas lógicas clásicas (AND, OR, NOT):

- **Hadamard (H):** pone un qubit en superposición equitativa de |0⟩ y |1⟩.
- **CNOT:** puerta de dos qubits que invierte el segundo (target) solo si el primero (control) es |1⟩. Es la puerta fundamental para crear entrelazamiento.
- **Z (Phase):** aplica un cambio de fase de π al estado |1⟩.
- **Medición (M):** colapsa el qubit a |0⟩ o |1⟩ con probabilidades |α|² y |β|².

**En ENTANGLE →** En el footer del dashboard se dibuja un circuito cuántico SVG de dos líneas horizontales (dos qubits). De izquierda a derecha se ven: un rectángulo con "H" (Hadamard), un punto conectado verticalmente a un símbolo ⊕ (CNOT), un rectángulo con "Z" (fase), y dos arcos con aguja (medición). El circuito completo genera un par de Bell — el estado más entrelazado posible. Al pasar el cursor sobre el footer, el circuito se hace más brillante.

---

## 11. Decoherencia

Proceso por el cual un sistema cuántico pierde sus propiedades cuánticas (superposición, entrelazamiento) al interactuar con su entorno. Es el principal obstáculo para construir computadores cuánticos estables.

**En ENTANGLE →** Cuando el backend no responde, aparece un banner sticky bajo el header con el texto "⚠️ Decoherencia detectada — Backend offline". El banner tiene una animación que hace temblar ligeramente el texto (inclinándose ±1° y desplazándose ±1px), como si el sistema perdiera estabilidad al perder su coherencia cuántica. Un LED rojo parpadea junto al mensaje.

---

## 12. Efecto túnel cuántico

Fenómeno donde una partícula atraviesa una barrera de energía que clásicamente sería imposible de superar. La función de onda no cae a cero al llegar a la barrera, sino que decae exponencialmente, permitiendo una probabilidad no nula de encontrar la partícula al otro lado.

**En ENTANGLE →** Al pasar el cursor sobre una fila de las tablas de ranking, un destello de luz con gradiente cian→púrpura barre la fila horizontalmente de izquierda a derecha en 0.6 segundos, como si una partícula atravesara una barrera. El efecto simula visualmente cómo la función de onda de una partícula penetra y cruza una barrera de potencial.

---

## 13. Delta de Dirac δ(x)

Distribución matemática que vale cero en todos los puntos excepto en x = 0, donde es infinita, y cuya integral total es 1. Representa un estado de posición perfectamente definida — el resultado ideal de una medición de posición.

**En ENTANGLE →** Cuando el WavefunctionCollapse de las tarjetas KPI pasa al estado colapsado (hover), la curva gaussiana se transforma en un pico extremadamente estrecho y alto, centrado en un único punto. Un círculo brillante con glow cian aparece en la cima del pico, marcando la posición exacta donde la "partícula" ha sido encontrada. La etiqueta cambia de |ψ|² a δ(x).

---

## 14. Estados propios (eigenstates)

Estados especiales de un operador cuántico que, al ser medidos con ese operador, siempre dan el mismo resultado (autovalor). Son los únicos estados que no cambian al ser medidos.

**En ENTANGLE →** Los rankings de las tablas usan la notación |n⟩ — cada posición es un eigenstate (resultado fijo de medir el ranking). Las etiquetas de expertise de los contribuidores asignan un nivel energético cuántico según su puntuación: "Ground State" (< 50, mínima energía), "Superposed" (≥ 50, potencial sin definir), "Entangled" (≥ 75, altamente correlacionado) y "Qubit Master" (≥ 90, control total del qubit).

---

## 15. Modelo atómico

Modelo donde electrones orbitan un núcleo central en niveles de energía discretos. Aunque simplificado respecto al modelo real (nube de probabilidad), es la imagen más reconocible de la física cuántica.

**En ENTANGLE →** Dos visualizaciones usan este modelo: el spinner de la pantalla de carga muestra tres órbitas elípticas (cian, púrpura, verde) a 0°, 60° y 120° con electrones que las recorren a diferentes velocidades y un núcleo central pulsante. El centro del grafo de colaboración reproduce el mismo concepto con un halo exterior pulsante, tres órbitas giratorias y tres electrones viajeros, representando el "átomo" del ecosistema de software cuántico.

---

*Documento de referencia para la memoria del TFG — ENTANGLE*
