/*
 * engine.js - Motor del juego Yahtzee y herramientas para Montecarlo.
 *
 * Aquí está toda la lógica del juego SIN nada de interfaz (no toca el DOM).
 * Lo separamos así para poder usar el mismo archivo en el navegador y en Node
 * (para correr las pruebas y generar los resultados del informe).
 *
 * Contenido:
 *   1. Generador de números aleatorios con semilla (mulberry32) y lanzamiento de dados.
 *   2. Reglas de puntuación (bono superior, bono de Yahtzee extra y comodín).
 *   3. Jugador computadora (reglas heurísticas) y simulación de partidas.
 *   4. Probabilidades teóricas exactas para comparar con lo simulado.
 *   5. Estadística (media, varianza, intervalos de confianza, chi-cuadrado).
 */

// Este envoltorio (patrón UMD sencillo) hace que el archivo funcione en los dos entornos:
// si existe "module" estamos en Node y exportamos con module.exports;
// si no, estamos en el navegador y lo dejamos en window.YahtzeeEngine.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.YahtzeeEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------- Constantes
  // Las 13 casillas de la hoja de puntuación, separadas en sección superior e inferior.
  const UPPER = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
  const LOWER = ['threeOfKind', 'fourOfKind', 'fullHouse', 'smallStraight', 'largeStraight', 'yahtzee', 'chance'];
  const CATEGORIES = UPPER.concat(LOWER);

  // Nombres en español para mostrar en pantalla (el código usa los ids en inglés).
  const NAMES = {
    ones: 'Unos', twos: 'Doses', threes: 'Treses', fours: 'Cuatros', fives: 'Cincos', sixes: 'Seises',
    threeOfKind: 'Tercia', fourOfKind: 'Póker', fullHouse: 'Full House',
    smallStraight: 'Escalera pequeña', largeStraight: 'Escalera grande', yahtzee: 'Yahtzee', chance: 'Suerte'
  };

  const UPPER_BONUS_THRESHOLD = 63; // si la sección superior suma 63 o más...
  const UPPER_BONUS = 35;           // ...se ganan 35 puntos extra
  const YAHTZEE_BONUS = 100;        // por cada Yahtzee adicional (si la casilla Yahtzee tiene 50)
  const NUM_DICE = 5;
  const MAX_ROLLS = 3;              // máximo de lanzamientos por turno

  // ------------------------------------------------------- Números aleatorios
  // mulberry32 es un generador pseudoaleatorio de 32 bits. Lo usamos en lugar de
  // Math.random() porque acepta una SEMILLA: con la misma semilla sale siempre la
  // misma secuencia, y así los resultados del informe se pueden reproducir.
  // Devuelve una función que cada vez que se llama da un número en [0, 1).
  function mulberry32(seed) {
    let a = seed >>> 0; // forzamos a entero sin signo de 32 bits
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      // mezcla de bits (así está definido el algoritmo, no lo inventamos)
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296; // dividimos entre 2^32 para quedar en [0,1)
    };
  }

  // Si no nos dan semilla usamos Math.random (para jugar normal);
  // si nos dan una, usamos mulberry32 (para experimentos reproducibles).
  function makeRng(seed) {
    return (seed === undefined || seed === null || seed === '') ? Math.random : mulberry32(Number(seed));
  }

  // Un dado: pasamos de U[0,1) a la uniforme discreta {1,...,6}.
  // rng()*6 está en [0,6), floor da 0..5 y le sumamos 1. Cada cara tiene P = 1/6.
  function rollDie(rng) { return Math.floor(rng() * 6) + 1; }

  // Lanza los 5 dados. "keep" es un arreglo de booleanos: true = ese dado se queda como está.
  // Solo se vuelven a lanzar los dados que NO están retenidos.
  function rollDice(rng, dice, keep) {
    const out = new Array(NUM_DICE);
    for (let i = 0; i < NUM_DICE; i++) out[i] = (keep && keep[i]) ? dice[i] : rollDie(rng);
    return out;
  }

  // ------------------------------------------------------------ Utilidades
  // Cuenta cuántas veces sale cada cara. Ejemplo: [3,3,5,1,3] -> [1,0,3,0,1,0]
  // (la posición 0 es la cara 1, la posición 5 es la cara 6).
  function faceCounts(dice) {
    const c = [0, 0, 0, 0, 0, 0];
    for (const d of dice) c[d - 1]++;
    return c;
  }
  function sumDice(dice) { return dice.reduce((a, b) => a + b, 0); }
  // Yahtzee = los 5 dados son iguales al primero
  function isYahtzee(dice) { return dice.every(d => d === dice[0]); }

  // Longitud de la racha más larga de caras consecutivas que aparecen (para las escaleras).
  // Ejemplo: caras 1,2,3,4,6 -> racha de 4.
  function longestRun(counts) {
    let best = 0, cur = 0;
    for (let i = 0; i < 6; i++) {
      cur = counts[i] > 0 ? cur + 1 : 0; // si la cara aparece seguimos la racha, si no se reinicia
      if (cur > best) best = cur;
    }
    return best;
  }

  // -------------------------------------------------------------- Puntuación
  // Puntos que daría una casilla con esos dados (reglas normales, sin comodín).
  function baseScore(cat, dice) {
    const c = faceCounts(dice);
    const idx = UPPER.indexOf(cat);
    // Casillas de unos a seises: (cuántas veces sale la cara) * (valor de la cara)
    if (idx >= 0) return c[idx] * (idx + 1);
    const total = sumDice(dice);
    switch (cat) {
      case 'threeOfKind': return c.some(n => n >= 3) ? total : 0;
      case 'fourOfKind': return c.some(n => n >= 4) ? total : 0;
      case 'fullHouse': return (c.includes(3) && c.includes(2)) ? 25 : 0; // un trío y una pareja
      case 'smallStraight': return longestRun(c) >= 4 ? 30 : 0;
      case 'largeStraight': return longestRun(c) >= 5 ? 40 : 0;
      case 'yahtzee': return isYahtzee(dice) ? 50 : 0;
      case 'chance': return total;
      default: throw new Error('Categoría desconocida: ' + cat);
    }
  }

  // Comodín: un Yahtzee extra cuenta como Full House o escalera aunque no cumpla
  // la forma exacta, así que da los puntos completos en esas tres casillas.
  function jokerScore(cat, dice) {
    if (cat === 'fullHouse') return 25;
    if (cat === 'smallStraight') return 30;
    if (cat === 'largeStraight') return 40;
    return baseScore(cat, dice);
  }

  // Hoja de puntuación vacía: null significa "casilla todavía no usada".
  // yahtzeeBonuses cuenta cuántos Yahtzee extra lleva el jugador.
  function newCard() {
    const scores = {};
    for (const c of CATEGORIES) scores[c] = null;
    return { scores, yahtzeeBonuses: 0 };
  }

  // Hay comodín cuando salió Yahtzee y la casilla Yahtzee ya se usó (con 50 o con 0).
  function isJoker(card, dice) { return isYahtzee(dice) && card.scores.yahtzee !== null; }

  // Casillas donde se puede anotar. Normalmente son todas las libres.
  // Con comodín las reglas oficiales obligan a:
  //   1) usar la casilla superior de ese número si está libre;
  //   2) si no, cualquier casilla inferior libre;
  //   3) si no, una casilla superior (que da 0 puntos).
  function legalCategories(card, dice) {
    const open = CATEGORIES.filter(c => card.scores[c] === null);
    if (!isJoker(card, dice)) return open;
    const upperCat = UPPER[dice[0] - 1]; // casilla superior que corresponde al número del Yahtzee
    if (card.scores[upperCat] === null) return [upperCat];
    const lowerOpen = open.filter(c => LOWER.includes(c));
    return lowerOpen.length ? lowerOpen : open;
  }

  // Puntos de una casilla, usando la regla del comodín si aplica.
  function scoreFor(card, cat, dice) {
    return isJoker(card, dice) ? jokerScore(cat, dice) : baseScore(cat, dice);
  }

  // Anota la jugada en la hoja. Devuelve { score, bonus } donde bonus es 100 si fue Yahtzee extra.
  function applyScore(card, cat, dice) {
    if (!legalCategories(card, dice).includes(cat)) throw new Error('Categoría no permitida: ' + cat);
    const score = scoreFor(card, cat, dice);
    // El bono de 100 solo se da si la casilla Yahtzee ya tiene 50 (si tiene 0 no hay bono).
    // Importante: esto se revisa ANTES de guardar el puntaje de esta jugada.
    const bonus = (isYahtzee(dice) && card.scores.yahtzee === 50) ? YAHTZEE_BONUS : 0;
    if (bonus) card.yahtzeeBonuses++;
    card.scores[cat] = score;
    return { score, bonus };
  }

  // Calcula los subtotales y el total de una hoja (solo suma las casillas ya usadas).
  function totals(card) {
    let upper = 0, lower = 0;
    for (const c of UPPER) if (card.scores[c] !== null) upper += card.scores[c];
    for (const c of LOWER) if (card.scores[c] !== null) lower += card.scores[c];
    const upperBonus = upper >= UPPER_BONUS_THRESHOLD ? UPPER_BONUS : 0;
    const yahtzeeBonus = card.yahtzeeBonuses * YAHTZEE_BONUS;
    return { upper, upperBonus, lower, yahtzeeBonus, total: upper + upperBonus + lower + yahtzeeBonus };
  }

  // La partida de un jugador termina cuando ya no le quedan casillas libres.
  function isCardComplete(card) { return CATEGORIES.every(c => card.scores[c] !== null); }

  // ------------------------------------------------------- Jugador computadora
  // Una "estrategia" es un objeto con dos funciones:
  //   chooseKeep(dice, rollsLeft, card, rng) -> arreglo de 5 booleanos (true = retener ese dado)
  //   chooseCategory(dice, card, rng)        -> casilla donde anotar (debe ser legal)
  //
  // La computadora juega con reglas heurísticas (no es la estrategia óptima, pero juega
  // bastante mejor que elegir al azar). Sus decisiones no tienen aleatoriedad: el azar
  // solo viene de los dados.
  //   Retener: conserva combinaciones que ya tiene (Yahtzee, Full House, escalera);
  //            si hay 4 caras seguidas persigue la escalera; en otro caso se queda con
  //            la cara más repetida (si hay empate, con la más alta).
  //   Anotar:  elige la casilla donde más supera el valor típico de esa casilla.
  //            Así, cuando la jugada es mala, sacrifica primero las casillas baratas
  //            (Unos, Póker...) y se guarda las valiosas.

  // Valor "típico" de cada casilla. Son números que ajustamos probando a ojo; sirven
  // de referencia para decidir dónde conviene anotar.
  const PAR = {
    ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18,
    threeOfKind: 20, fourOfKind: 13, fullHouse: 20, smallStraight: 25, largeStraight: 28, yahtzee: 20, chance: 23
  };

  const computerStrategy = {
    id: "computer",
    label: "Computadora",

    // Decide qué dados retener antes del siguiente lanzamiento.
    chooseKeep(dice, rollsLeft, card) {
      const c = faceCounts(dice);
      const keepAll = [true, true, true, true, true];
      const open = cat => card.scores[cat] === null; // ¿la casilla sigue libre?
      const run = longestRun(c);

      // 1) Si ya tenemos una combinación buena que sirve para una casilla libre, no relanzamos nada.
      if (isYahtzee(dice)) return keepAll;
      if (open("fullHouse") && c.includes(3) && c.includes(2)) return keepAll;
      if (run >= 5 && (open("largeStraight") || open("smallStraight"))) return keepAll;
      if (run === 4 && open("smallStraight") && !open("largeStraight")) return keepAll;

      // 2) Perseguir escalera: dejamos un dado por cada cara de la racha más larga
      //    y relanzamos el resto (incluidos los repetidos).
      if (run >= 4 && (open("smallStraight") || open("largeStraight"))) {
        // buscamos dónde empieza la racha más larga y cuánto mide
        let best = 0, bestStart = 0, cur = 0, start = 0;
        for (let i = 0; i < 6; i++) {
          if (c[i] > 0) { if (cur === 0) start = i; cur++; if (cur > best) { best = cur; bestStart = start; } } else cur = 0;
        }
        const seen = new Set(); // para quedarnos con un solo dado de cada cara
        return dice.map(d => {
          const inRun = d - 1 >= bestStart && d - 1 < bestStart + best;
          if (inRun && !seen.has(d)) { seen.add(d); return true; }
          return false;
        });
      }

      // 3) Caso general: nos quedamos con la cara que más se repite (empate -> la más alta).
      let face = 0;
      for (let i = 0; i < 6; i++) if (c[i] > 0 && (c[i] > c[face] || (c[i] === c[face] && i > face))) face = i;
      return dice.map(d => d === face + 1);
    },

    // Decide en qué casilla anotar: la que tenga mayor (puntos - valor típico).
    chooseCategory(dice, card) {
      const legal = legalCategories(card, dice);
      let best = legal[0], bestVal = -Infinity;
      for (const cat of legal) {
        const val = scoreFor(card, cat, dice) - PAR[cat];
        if (val > bestVal) { bestVal = val; best = cat; }
      }
      return best;
    }
  };

  // Tabla de estrategias disponibles (por ahora solo la computadora).
  const STRATEGIES = { computer: computerStrategy };

  // -------------------------------------------------------------- Simulación
  // Simula la parte de lanzamientos de UN turno (hasta 3 tiradas) con la estrategia dada.
  // Devuelve { dice, rolls }: los dados finales y cuántos lanzamientos se hicieron.
  // "onNewDie" es opcional: se llama con cada dado recién lanzado (sirve para llevar
  // estadísticas contando solo los dados nuevos y no los retenidos).
  function playTurnRolls(strategy, card, rng, onNewDie) {
    let dice = rollDice(rng, [0, 0, 0, 0, 0], null); // primer lanzamiento: los 5 dados
    if (onNewDie) for (const d of dice) onNewDie(d);
    let rolls = 1;
    while (rolls < MAX_ROLLS) {
      const keep = strategy.chooseKeep(dice, MAX_ROLLS - rolls, card, rng);
      if (keep.every(Boolean)) break; // si retiene todo, ya no tiene sentido seguir lanzando
      const next = rollDice(rng, dice, keep);
      if (onNewDie) for (let i = 0; i < NUM_DICE; i++) if (!keep[i]) onNewDie(next[i]);
      dice = next;
      rolls++;
    }
    return { dice, rolls };
  }

  // Simula una partida completa. "strategies" tiene una estrategia por jugador
  // (para este trabajo son 2). Son 13 rondas y en cada ronda juega cada jugador.
  function playGame(strategies, rng, hooks) {
    const cards = strategies.map(() => newCard());
    const yahtzeeTurns = strategies.map(() => 0); // en cuántos turnos terminó en Yahtzee cada jugador
    for (let round = 0; round < CATEGORIES.length; round++) {
      for (let p = 0; p < strategies.length; p++) {
        const strat = strategies[p];
        const { dice } = playTurnRolls(strat, cards[p], rng, hooks && hooks.onNewDie);
        if (isYahtzee(dice)) yahtzeeTurns[p]++;
        const cat = strat.chooseCategory(dice, cards[p], rng);
        applyScore(cards[p], cat, dice);
      }
    }
    const t = cards.map(totals);
    return { cards, totals: t, scores: t.map(x => x.total), yahtzeeTurns };
  }

  // -------------------------------------------------- Probabilidades exactas
  // Eventos que se pueden dar en UNA sola tirada de 5 dados. "test" recibe el conteo
  // de caras y dice si el evento ocurre (usa las mismas condiciones que la puntuación).
  const SINGLE_ROLL_EVENTS = [
    { id: 'threeOfKind', label: 'Tercia (≥3 iguales)', test: c => c.some(n => n >= 3) },
    { id: 'fourOfKind', label: 'Póker (≥4 iguales)', test: c => c.some(n => n >= 4) },
    { id: 'fullHouse', label: 'Full House (3+2)', test: c => c.includes(3) && c.includes(2) },
    { id: 'smallStraight', label: 'Escalera pequeña (≥4 seguidos)', test: c => longestRun(c) >= 4 },
    { id: 'largeStraight', label: 'Escalera grande (5 seguidos)', test: c => longestRun(c) >= 5 },
    { id: 'yahtzee', label: 'Yahtzee (5 iguales)', test: c => c.includes(5) }
  ];

  // Probabilidad EXACTA de cada evento: recorremos los 6^5 = 7776 resultados posibles
  // (todos igual de probables) y contamos en cuántos ocurre el evento.
  // Esto es lo que usamos después para comparar contra la simulación.
  function exactSingleRollProbabilities() {
    const hits = {};
    for (const e of SINGLE_ROLL_EVENTS) hits[e.id] = 0;
    const total = Math.pow(6, NUM_DICE);
    const dice = new Array(NUM_DICE);
    for (let n = 0; n < total; n++) {
      // convertimos el número n a base 6: cada dígito es un dado (0..5 -> 1..6)
      let x = n;
      for (let i = 0; i < NUM_DICE; i++) { dice[i] = (x % 6) + 1; x = Math.floor(x / 6); }
      const c = faceCounts(dice);
      for (const e of SINGLE_ROLL_EVENTS) if (e.test(c)) hits[e.id]++;
    }
    const probs = {};
    for (const e of SINGLE_ROLL_EVENTS) probs[e.id] = { favorable: hits[e.id], total, p: hits[e.id] / total };
    return probs;
  }

  // Probabilidad exacta de sacar Yahtzee en un turno (hasta "rolls" lanzamientos)
  // si siempre se retiene la cara más repetida. Se resuelve por programación dinámica:
  // lo único que importa del estado es "m", cuántos dados iguales llevamos (el máximo).
  // P(m, r) = probabilidad de terminar en Yahtzee teniendo m iguales y r lanzamientos por hacer.
  function exactYahtzeeInTurn(rolls) {
    const memo = new Map(); // guardamos los resultados ya calculados para no repetir
    function P(m, r) {
      if (m === 5) return 1;  // ya hay Yahtzee
      if (r === 0) return 0;  // no quedan lanzamientos y no hay Yahtzee
      const key = m + ',' + r;
      if (memo.has(key)) return memo.get(key);
      const k = NUM_DICE - m; // dados que se relanzan
      const total = Math.pow(6, k);
      let acc = 0;
      // recorremos todos los resultados posibles de esos k dados
      for (let n = 0; n < total; n++) {
        const c = [0, 0, 0, 0, 0, 0];
        let x = n;
        for (let i = 0; i < k; i++) { c[x % 6]++; x = Math.floor(x / 6); }
        // Tomamos la cara retenida como la cara 0; las otras caras pueden formar un grupo
        // más grande, por eso sacamos el máximo entre todas.
        const newMax = Math.max(m + c[0], c[1], c[2], c[3], c[4], c[5]);
        acc += P(newMax, r - 1);
      }
      const res = acc / total; // promedio sobre los resultados equiprobables
      memo.set(key, res);
      return res;
    }
    // Primer lanzamiento: recorremos las 7776 tiradas posibles y vemos con cuántos iguales empezamos.
    const total = Math.pow(6, NUM_DICE);
    let acc = 0;
    for (let n = 0; n < total; n++) {
      const c = [0, 0, 0, 0, 0, 0];
      let x = n;
      for (let i = 0; i < NUM_DICE; i++) { c[x % 6]++; x = Math.floor(x / 6); }
      acc += P(Math.max(...c), rolls - 1);
    }
    return acc / total;
  }

  // ------------------------------------------------------ Estadística en línea
  // Clase para ir calculando media y varianza dato por dato, sin guardar todos los datos
  // (con millones de simulaciones no conviene guardarlos). Usa el algoritmo de Welford,
  // que es más estable numéricamente que acumular sumas y sumas de cuadrados.
  class RunningStats {
    constructor() { this.n = 0; this.mean = 0; this.m2 = 0; this.min = Infinity; this.max = -Infinity; }
    // Agrega un dato nuevo y actualiza media y suma de cuadrados de las diferencias (m2).
    add(x) {
      this.n++;
      const d = x - this.mean;
      this.mean += d / this.n;
      this.m2 += d * (x - this.mean);
      if (x < this.min) this.min = x;
      if (x > this.max) this.max = x;
    }
    get variance() { return this.n > 1 ? this.m2 / (this.n - 1) : 0; } // varianza muestral (n-1)
    get std() { return Math.sqrt(this.variance); }
    get sem() { return this.n > 0 ? this.std / Math.sqrt(this.n) : 0; }          // error estándar = s/√n
    get ci95() { return 1.96 * this.sem; }                                        // semiancho del IC al 95 %
  }

  // Semiancho del intervalo de confianza al 95 % para una proporción p observada en n intentos.
  function proportionCI95(p, n) { return n > 0 ? 1.96 * Math.sqrt(p * (1 - p) / n) : 0; }

  // Estadístico chi-cuadrado para ver si unas frecuencias observadas son compatibles con
  // una distribución uniforme: suma de (observado - esperado)^2 / esperado.
  function chiSquareUniform(observed) {
    const n = observed.reduce((a, b) => a + b, 0);
    const e = n / observed.length; // frecuencia esperada de cada categoría si fuera uniforme
    return e === 0 ? 0 : observed.reduce((acc, o) => acc + (o - e) * (o - e) / e, 0);
  }
  // Valor crítico de la tabla chi-cuadrado: 5 grados de libertad (6 caras - 1) y α = 0.05
  const CHI2_CRIT_5_DF = 11.0705;

  // Lista de valores de n (espaciados en escala logarítmica: 1, 2, 3, 5, 8, 10, ...) en los
  // que guardamos el resultado acumulado para graficar la convergencia.
  // "perDecade" = cuántos puntos queremos por cada potencia de 10.
  function logCheckpoints(maxN, perDecade) {
    const pts = new Set(); // Set para que no queden valores repetidos al redondear
    for (let e = 0; Math.pow(10, e / perDecade) <= maxN; e++) pts.add(Math.max(1, Math.round(Math.pow(10, e / perDecade))));
    pts.add(maxN);
    return Array.from(pts).sort((a, b) => a - b);
  }

  // Todo lo que queremos que se vea desde afuera (app.js, pruebas, etc.)
  return {
    UPPER, LOWER, CATEGORIES, NAMES, UPPER_BONUS_THRESHOLD, UPPER_BONUS, YAHTZEE_BONUS, NUM_DICE, MAX_ROLLS,
    mulberry32, makeRng, rollDie, rollDice,
    faceCounts, sumDice, isYahtzee, longestRun,
    baseScore, jokerScore, newCard, isJoker, legalCategories, scoreFor, applyScore, totals, isCardComplete,
    computerStrategy, STRATEGIES,
    playTurnRolls, playGame,
    SINGLE_ROLL_EVENTS, exactSingleRollProbabilities, exactYahtzeeInTurn,
    RunningStats, proportionCI95, chiSquareUniform, CHI2_CRIT_5_DF, logCheckpoints
  };
});
