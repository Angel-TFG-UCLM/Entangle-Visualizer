/**
 * Universe shared utilities
 * =========================
 * Modulo compartido entre UniverseView.jsx, computeLayout.worker.js y
 * computeDetailData.worker.js para evitar duplicacion de codigo.
 *
 * Como los workers usan { type: 'module' }, pueden importar este archivo
 * directamente igual que el componente React.
 */

// ============================================================================
// PRNG
// ============================================================================

/**
 * Generador pseudo-aleatorio con semilla (Park-Miller / minimal standard).
 * Determinista para reproducibilidad visual entre re-renders.
 * @param {number} seed - Semilla inicial entera positiva.
 * @returns {() => number} funcion que devuelve floats en [0, 1).
 */
export function seededRandom(seed) {
  let s = seed
  return () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646 }
}

// ============================================================================
// Vector 3D minimo
// ============================================================================
// Solo necesitamos constructor + distanceTo. Mantener fuera de Three.js para
// que sea utilizable desde Web Workers (donde Three.js no carga).

export class Vec3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z }
  distanceTo(v) {
    return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z)
  }
}

// ============================================================================
// Sibling org detection
// ============================================================================

/**
 * Detecta si dos logins de organizaciones son "hermanas" de la misma marca
 * (ej: qiskit / qiskit-community). Replica la heuristica del backend.
 *
 * PRONG 1 (token-based): primer token coincidente (>=4 chars), uno debe ser single-token.
 * PRONG 2 (prefix-based): prefijo normalizado mas corto del mas largo, ratio <= 3.
 *
 * @param {string} loginA
 * @param {string} loginB
 * @returns {boolean}
 */
export function areSiblingOrgs(loginA, loginB) {
  if (!loginA || !loginB) return false
  const la = loginA.toLowerCase(), lb = loginB.toLowerCase()
  if (la === lb) return true
  const ta = la.split(/[-_.\s]+/).filter(Boolean)
  const tb = lb.split(/[-_.\s]+/).filter(Boolean)
  if (ta.length && tb.length && ta[0].length >= 4 && ta[0] === tb[0]) {
    if (ta.length === 1 || tb.length === 1) return true
  }
  const a = la.replaceAll(/[-_\s.]+/g, ''), b = lb.replaceAll(/[-_\s.]+/g, '')
  if (!a || !b) return false
  const [s, l] = a.length <= b.length ? [a, b] : [b, a]
  if (s.length >= 4 && l.startsWith(s) && l.length / s.length <= 3) return true
  return false
}

// ============================================================================
// Jenks Natural Breaks (Fisher-Jenks)
// ============================================================================

/**
 * Caso degenerado: cuando hay menos elementos que clases pedidas, devuelve
 * fronteras equiespaciadas y cada elemento en su propia clase.
 */
function jenksTrivialPartition(sorted, nClasses) {
  const n = sorted.length
  const step = n > 1 ? (sorted[n - 1] - sorted[0]) / nClasses : sorted[0]
  return {
    boundaries: Array.from({ length: nClasses - 1 }, (_, i) => sorted[0] + step * (i + 1)),
    classStarts: Array.from({ length: nClasses }, (_, i) => Math.min(i, n - 1)),
    sorted,
  }
}

/**
 * Programación dinámica de Jenks: devuelve las matrices `lower` (split points)
 * y `vari` (SDCM mínima) para todos los pares (i, j) donde i = 1..n y j = 1..nClasses.
 */
function jenksDPMatrices(sorted, nClasses) {
  const n = sorted.length
  const lower = Array.from({ length: n + 1 }, () => new Int32Array(nClasses + 1))
  const vari = Array.from({ length: n + 1 }, () => {
    const r = new Float64Array(nClasses + 1); r.fill(Infinity); return r
  })

  for (let j = 1; j <= nClasses; j++) { lower[1][j] = 1; vari[1][j] = 0 }

  for (let l = 2; l <= n; l++) {
    jenksDPRow(sorted, nClasses, l, lower, vari)
  }
  return { lower, vari }
}

/**
 * Procesa una fila l de la programación dinámica de Jenks: itera todas las
 * particiones posibles del prefijo y actualiza `lower[l][*]` y `vari[l][*]`.
 */
function jenksDPRow(sorted, nClasses, l, lower, vari) {
  let sum = 0, sumSq = 0, w = 0
  for (let m = 1; m <= l; m++) {
    const i3 = l - m + 1
    const val = sorted[i3 - 1]
    w++; sum += val; sumSq += val * val
    const v = sumSq - (sum * sum) / w
    if (i3 > 1) {
      jenksTryBetterSplit(v, i3, l, nClasses, lower, vari)
    }
  }
  lower[l][1] = 1
  vari[l][1] = sumSq - (sum * sum) / w
}

/** Para un split point i3, prueba todas las clases j>=2 y conserva el coste mínimo. */
function jenksTryBetterSplit(v, i3, l, nClasses, lower, vari) {
  for (let j = 2; j <= nClasses; j++) {
    const cost = v + vari[i3 - 1][j - 1]
    if (cost < vari[l][j]) { lower[l][j] = i3; vari[l][j] = cost }
  }
}

/**
 * Backtrack desde la matriz `lower` para reconstruir los índices de inicio
 * (0-based) de cada clase.
 */
function jenksBacktrackClassStarts(lower, n, nClasses) {
  const classStarts = new Array(nClasses)
  classStarts[0] = 0
  let k = n
  for (let j = nClasses; j >= 2; j--) {
    classStarts[j - 1] = lower[k][j] - 1
    k = lower[k][j] - 1
  }
  return classStarts
}

/**
 * Clasifica datos 1D en k grupos minimizando la varianza intra-grupo (SDCM).
 * Las fronteras emergen de la distribucion real de los datos, sin constantes
 * arbitrarias. Complejidad O(n^2 * k); trivial para n~127, k=3.
 *
 * Ref: Fisher, W.D. (1958) "On Grouping for Maximum Homogeneity",
 *      Journal of the American Statistical Association, 53(284):789-798.
 *
 * @param {number[]} data
 * @param {number} nClasses
 * @returns {{boundaries: number[], classStarts: number[], sorted: number[]}}
 */
export function jenksNaturalBreaks(data, nClasses) {
  const sorted = [...data].sort((a, b) => a - b)
  const n = sorted.length

  if (n <= nClasses) return jenksTrivialPartition(sorted, nClasses)

  const { lower } = jenksDPMatrices(sorted, nClasses)
  const classStarts = jenksBacktrackClassStarts(lower, n, nClasses)

  // Frontera = punto medio entre ultimo de clase C y primero de clase C+1
  const boundaries = []
  for (let c = 1; c < nClasses; c++) {
    boundaries.push((sorted[classStarts[c] - 1] + sorted[classStarts[c]]) / 2)
  }

  return { boundaries, classStarts, sorted }
}

// ============================================================================
// Percentile rank
// ============================================================================

/**
 * Devuelve la posicion relativa (0..1) de un valor dentro de un array ordenado.
 * Implementa la "mid-rank CDF": incluye medio punto por empates para evitar
 * saltos discretos cuando varios elementos comparten el mismo valor.
 *
 * @param {number[]} sorted - array previamente ordenado ascendente
 * @param {number} value
 * @returns {number} en [0, 1]
 */
export function percentileRank(sorted, value) {
  if (!sorted || sorted.length === 0) return 0
  const n = sorted.length
  // bisectLeft: primer indice donde sorted[i] >= value
  let lo = 0, hi = n
  while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < value) lo = m + 1; else hi = m }
  // bisectRight: primer indice donde sorted[i] > value
  let lo2 = lo, hi2 = n
  while (lo2 < hi2) { const m = (lo2 + hi2) >> 1; if (sorted[m] <= value) lo2 = m + 1; else hi2 = m }
  return ((lo + lo2) / 2) / n
}
