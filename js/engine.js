/*
 * engine.js - Motor del juego Yahtzee y herramientas Montecarlo.
 *
 * Es lógica pura (sin DOM) para poder usarla tanto en el navegador como en
 * Node.js (pruebas y generación del informe).
 *
 * Contenido:
 *   1. Generador pseudoaleatorio con semilla (mulberry32) y lanzamiento de dados.
 *   2. Reglas de puntuación (incluye bono superior, bono Yahtzee y comodín).
 *   3. Jugador computadora (heurística) y simulación de partidas.
 *   4. Probabilidades teóricas exactas (enumeración) para contrastar con Montecarlo.
 *   5. Estadística en línea (algoritmo de Welford) e intervalos de confianza.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.YahtzeeEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------- Constantes
  const UPPER = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
  const LOWER = ['threeOfKind', 'fourOfKind', 'fullHouse', 'smallStraight', 'largeStraight', 'yahtzee', 'chance'];
  const CATEGORIES = UPPER.concat(LOWER);
  const NAMES = {
    ones: 'Unos', twos: 'Doses', threes: 'Treses', fours: 'Cuatros', fives: 'Cincos', sixes: 'Seises',
    threeOfKind: 'Tercia', fourOfKind: 'Póker', fullHouse: 'Full House',
    smallStraight: 'Escalera pequeña', largeStraight: 'Escalera grande', yahtzee: 'Yahtzee', chance: 'Suerte'
  };
  const UPPER_BONUS_THRESHOLD = 63;
  const UPPER_BONUS = 35;
  const YAHTZEE_BONUS = 100;
  const NUM_DICE = 5;
  const MAX_ROLLS = 3;

  // ------------------------------------------------------- Números aleatorios
  // mulberry32: PRNG de 32 bits, rápido y de buena calidad estadística para
  // simulación. Con semilla => resultados reproducibles (necesario para el informe).
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeRng(seed) {
    return (seed === undefined || seed === null || seed === '') ? Math.random : mulberry32(Number(seed));
  }

  // Transformada de la uniforme U[0,1) a la uniforme discreta {1..6}: P(X=k)=1/6.
  function rollDie(rng) { return Math.floor(rng() * 6) + 1; }

  function rollDice(rng, dice, keep) {
    // Solo se vuelven a lanzar los dados no retenidos.
    const out = new Array(NUM_DICE);
    for (let i = 0; i < NUM_DICE; i++) out[i] = (keep && keep[i]) ? dice[i] : rollDie(rng);
    return out;
  }

  // ------------------------------------------------------------ Utilidades
  function faceCounts(dice) {
    const c = [0, 0, 0, 0, 0, 0];
    for (const d of dice) c[d - 1]++;
    return c;
  }
  function sumDice(dice) { return dice.reduce((a, b) => a + b, 0); }
  function isYahtzee(dice) { return dice.every(d => d === dice[0]); }
  function longestRun(counts) {
    let best = 0, cur = 0;
    for (let i = 0; i < 6; i++) {
      cur = counts[i] > 0 ? cur + 1 : 0;
      if (cur > best) best = cur;
    }
    return best;
  }

  // -------------------------------------------------------------- Puntuación
  function baseScore(cat, dice) {
    const c = faceCounts(dice);
    const idx = UPPER.indexOf(cat);
    if (idx >= 0) return c[idx] * (idx + 1);
    const total = sumDice(dice);
    switch (cat) {
      case 'threeOfKind': return c.some(n => n >= 3) ? total : 0;
      case 'fourOfKind': return c.some(n => n >= 4) ? total : 0;
      case 'fullHouse': return (c.includes(3) && c.includes(2)) ? 25 : 0;
      case 'smallStraight': return longestRun(c) >= 4 ? 30 : 0;
      case 'largeStraight': return longestRun(c) >= 5 ? 40 : 0;
      case 'yahtzee': return isYahtzee(dice) ? 50 : 0;
      case 'chance': return total;
      default: throw new Error('Categoría desconocida: ' + cat);
    }
  }

  // Comodín: un Yahtzee adicional puntúa completo en Full House / escaleras.
  function jokerScore(cat, dice) {
    if (cat === 'fullHouse') return 25;
    if (cat === 'smallStraight') return 30;
    if (cat === 'largeStraight') return 40;
    return baseScore(cat, dice);
  }

  function newCard() {
    const scores = {};
    for (const c of CATEGORIES) scores[c] = null;
    return { scores, yahtzeeBonuses: 0 };
  }

  function isJoker(card, dice) { return isYahtzee(dice) && card.scores.yahtzee !== null; }

  // Reglas oficiales: con comodín hay que usar la casilla superior de ese número si
  // está libre; si no, cualquier casilla inferior libre; si no, una superior (0 pts).
  function legalCategories(card, dice) {
    const open = CATEGORIES.filter(c => card.scores[c] === null);
    if (!isJoker(card, dice)) return open;
    const upperCat = UPPER[dice[0] - 1];
    if (card.scores[upperCat] === null) return [upperCat];
    const lowerOpen = open.filter(c => LOWER.includes(c));
    return lowerOpen.length ? lowerOpen : open;
  }

  function scoreFor(card, cat, dice) {
    return isJoker(card, dice) ? jokerScore(cat, dice) : baseScore(cat, dice);
  }

  // Registra la jugada en la hoja. Devuelve {score, bonus} (bonus = Yahtzee extra).
  function applyScore(card, cat, dice) {
    if (!legalCategories(card, dice).includes(cat)) throw new Error('Categoría no permitida: ' + cat);
    const score = scoreFor(card, cat, dice);
    const bonus = (isYahtzee(dice) && card.scores.yahtzee === 50) ? YAHTZEE_BONUS : 0;
    if (bonus) card.yahtzeeBonuses++;
    card.scores[cat] = score;
    return { score, bonus };
  }

  function totals(card) {
    let upper = 0, lower = 0;
    for (const c of UPPER) if (card.scores[c] !== null) upper += card.scores[c];
    for (const c of LOWER) if (card.scores[c] !== null) lower += card.scores[c];
    const upperBonus = upper >= UPPER_BONUS_THRESHOLD ? UPPER_BONUS : 0;
    const yahtzeeBonus = card.yahtzeeBonuses * YAHTZEE_BONUS;
    return { upper, upperBonus, lower, yahtzeeBonus, total: upper + upperBonus + lower + yahtzeeBonus };
  }

  function isCardComplete(card) { return CATEGORIES.every(c => card.scores[c] !== null); }

  // ------------------------------------------------------- Jugador computadora
  // Una estrategia expone:
  //   chooseKeep(dice, rollsLeft, card, rng) -> array de 5 booleanos (true = retener)
  //   chooseCategory(dice, card, rng)        -> categoría legal
  //
  // La computadora juega con criterio (reglas heurísticas; el azar solo está en los dados):
  //   Retener: conserva combinaciones ya hechas (Yahtzee, Full House, escalera);
  //            persigue una escalera si hay 4 caras seguidas; en otro caso conserva
  //            la cara más repetida (empates -> la más alta).
  //   Anotar:  elige la casilla que maximiza (puntos obtenidos - valor típico de la
  //            casilla), de modo que cuando no hay buena jugada sacrifica primero
  //            las casillas baratas (Unos, Póker...) y reserva las valiosas.

  // Valor típico de cada casilla (referencia para decidir dónde anotar).
  const PAR = {
    ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18,
    threeOfKind: 20, fourOfKind: 13, fullHouse: 20, smallStraight: 25, largeStraight: 28, yahtzee: 20, chance: 23
  };

  const computerStrategy = {
    id: "computer",
    label: "Computadora",
    chooseKeep(dice, rollsLeft, card) {
      const c = faceCounts(dice);
      const keepAll = [true, true, true, true, true];
      const open = cat => card.scores[cat] === null;
      const run = longestRun(c);

      if (isYahtzee(dice)) return keepAll;
      if (open("fullHouse") && c.includes(3) && c.includes(2)) return keepAll;
      if (run >= 5 && (open("largeStraight") || open("smallStraight"))) return keepAll;
      if (run === 4 && open("smallStraight") && !open("largeStraight")) return keepAll;

      // Perseguir escalera: retener un dado por cada cara de la racha más larga.
      if (run >= 4 && (open("smallStraight") || open("largeStraight"))) {
        let best = 0, bestStart = 0, cur = 0, start = 0;
        for (let i = 0; i < 6; i++) {
          if (c[i] > 0) { if (cur === 0) start = i; cur++; if (cur > best) { best = cur; bestStart = start; } } else cur = 0;
        }
        const seen = new Set();
        return dice.map(d => {
          const inRun = d - 1 >= bestStart && d - 1 < bestStart + best;
          if (inRun && !seen.has(d)) { seen.add(d); return true; }
          return false;
        });
      }

      // En otro caso: retener la cara más repetida (empates -> la más alta).
      let face = 0;
      for (let i = 0; i < 6; i++) if (c[i] > 0 && (c[i] > c[face] || (c[i] === c[face] && i > face))) face = i;
      return dice.map(d => d === face + 1);
    },
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

  const STRATEGIES = { computer: computerStrategy };

  // -------------------------------------------------------------- Simulación
  // Juega un turno completo (hasta 3 tiradas) con la estrategia dada.
  // Devuelve {dice, rolls, newDiceValues} donde newDiceValues son SOLO los dados
  // recién lanzados (muestras independientes, útiles para estadística).
  function playTurnRolls(strategy, card, rng, onNewDie) {
    let dice = rollDice(rng, [0, 0, 0, 0, 0], null);
    if (onNewDie) for (const d of dice) onNewDie(d);
    let rolls = 1;
    while (rolls < MAX_ROLLS) {
      const keep = strategy.chooseKeep(dice, MAX_ROLLS - rolls, card, rng);
      if (keep.every(Boolean)) break;
      const next = rollDice(rng, dice, keep);
      if (onNewDie) for (let i = 0; i < NUM_DICE; i++) if (!keep[i]) onNewDie(next[i]);
      dice = next;
      rolls++;
    }
    return { dice, rolls };
  }

  // Simula una partida completa para N jugadores (por defecto 2).
  function playGame(strategies, rng, hooks) {
    const cards = strategies.map(() => newCard());
    const yahtzeeTurns = strategies.map(() => 0);
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
  // Eventos de una sola tirada de 5 dados (consistentes con las reglas de puntuación).
  const SINGLE_ROLL_EVENTS = [
    { id: 'threeOfKind', label: 'Tercia (≥3 iguales)', test: c => c.some(n => n >= 3) },
    { id: 'fourOfKind', label: 'Póker (≥4 iguales)', test: c => c.some(n => n >= 4) },
    { id: 'fullHouse', label: 'Full House (3+2)', test: c => c.includes(3) && c.includes(2) },
    { id: 'smallStraight', label: 'Escalera pequeña (≥4 seguidos)', test: c => longestRun(c) >= 4 },
    { id: 'largeStraight', label: 'Escalera grande (5 seguidos)', test: c => longestRun(c) >= 5 },
    { id: 'yahtzee', label: 'Yahtzee (5 iguales)', test: c => c.includes(5) }
  ];

  // Enumera los 6^5 = 7776 resultados equiprobables.
  function exactSingleRollProbabilities() {
    const hits = {};
    for (const e of SINGLE_ROLL_EVENTS) hits[e.id] = 0;
    const total = Math.pow(6, NUM_DICE);
    const dice = new Array(NUM_DICE);
    for (let n = 0; n < total; n++) {
      let x = n;
      for (let i = 0; i < NUM_DICE; i++) { dice[i] = (x % 6) + 1; x = Math.floor(x / 6); }
      const c = faceCounts(dice);
      for (const e of SINGLE_ROLL_EVENTS) if (e.test(c)) hits[e.id]++;
    }
    const probs = {};
    for (const e of SINGLE_ROLL_EVENTS) probs[e.id] = { favorable: hits[e.id], total, p: hits[e.id] / total };
    return probs;
  }

  // Probabilidad exacta de lograr Yahtzee en un turno (hasta `rolls` tiradas)
  // reteniendo siempre la cara más repetida. El estado relevante es la multiplicidad
  // máxima m; se resuelve por programación dinámica enumerando los dados relanzados.
  function exactYahtzeeInTurn(rolls) {
    const memo = new Map();
    function P(m, r) {
      if (m === 5) return 1;
      if (r === 0) return 0;
      const key = m + ',' + r;
      if (memo.has(key)) return memo.get(key);
      const k = NUM_DICE - m;                // dados a relanzar
      const total = Math.pow(6, k);
      let acc = 0;
      for (let n = 0; n < total; n++) {
        const c = [0, 0, 0, 0, 0, 0];
        let x = n;
        for (let i = 0; i < k; i++) { c[x % 6]++; x = Math.floor(x / 6); }
        // La cara retenida se toma como la 0; las demás compiten por ser la más repetida.
        const newMax = Math.max(m + c[0], c[1], c[2], c[3], c[4], c[5]);
        acc += P(newMax, r - 1);
      }
      const res = acc / total;
      memo.set(key, res);
      return res;
    }
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
  // Algoritmo de Welford: media y varianza numéricamente estables en una pasada.
  class RunningStats {
    constructor() { this.n = 0; this.mean = 0; this.m2 = 0; this.min = Infinity; this.max = -Infinity; }
    add(x) {
      this.n++;
      const d = x - this.mean;
      this.mean += d / this.n;
      this.m2 += d * (x - this.mean);
      if (x < this.min) this.min = x;
      if (x > this.max) this.max = x;
    }
    get variance() { return this.n > 1 ? this.m2 / (this.n - 1) : 0; }
    get std() { return Math.sqrt(this.variance); }
    get sem() { return this.n > 0 ? this.std / Math.sqrt(this.n) : 0; }          // error estándar
    get ci95() { return 1.96 * this.sem; }                                        // semiancho IC 95 %
  }

  // IC 95 % (Wald) para una proporción observada.
  function proportionCI95(p, n) { return n > 0 ? 1.96 * Math.sqrt(p * (1 - p) / n) : 0; }

  // Estadístico chi-cuadrado de bondad de ajuste a la uniforme (k categorías).
  function chiSquareUniform(observed) {
    const n = observed.reduce((a, b) => a + b, 0);
    const e = n / observed.length;
    return e === 0 ? 0 : observed.reduce((acc, o) => acc + (o - e) * (o - e) / e, 0);
  }
  const CHI2_CRIT_5_DF = 11.0705; // valor crítico, 5 grados de libertad, α = 0.05

  // Puntos de control (escala logarítmica) para registrar la convergencia.
  function logCheckpoints(maxN, perDecade) {
    const pts = new Set();
    for (let e = 0; Math.pow(10, e / perDecade) <= maxN; e++) pts.add(Math.max(1, Math.round(Math.pow(10, e / perDecade))));
    pts.add(maxN);
    return Array.from(pts).sort((a, b) => a - b);
  }

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
