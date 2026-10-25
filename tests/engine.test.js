// Pruebas del motor. Ejecutar: node tests/engine.test.js
const assert = require('assert');
const E = require('../js/engine.js');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('  ok  ' + name);
}
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} vs ${b} (tol ${tol})`);

test('puntuación base: casillas superiores', () => {
  assert.strictEqual(E.baseScore('ones', [1, 1, 2, 3, 4]), 2);
  assert.strictEqual(E.baseScore('sixes', [6, 6, 6, 2, 1]), 18);
  assert.strictEqual(E.baseScore('fives', [1, 2, 3, 4, 6]), 0);
});

test('puntuación base: tercia, póker, full, suerte', () => {
  assert.strictEqual(E.baseScore('threeOfKind', [3, 3, 3, 5, 6]), 20);
  assert.strictEqual(E.baseScore('threeOfKind', [3, 3, 4, 5, 6]), 0);
  assert.strictEqual(E.baseScore('fourOfKind', [4, 4, 4, 4, 2]), 18);
  assert.strictEqual(E.baseScore('fourOfKind', [4, 4, 4, 2, 2]), 0);
  assert.strictEqual(E.baseScore('fullHouse', [2, 2, 5, 5, 5]), 25);
  assert.strictEqual(E.baseScore('fullHouse', [2, 2, 2, 2, 2]), 0);
  assert.strictEqual(E.baseScore('fullHouse', [2, 2, 5, 5, 6]), 0);
  assert.strictEqual(E.baseScore('chance', [1, 2, 3, 4, 6]), 16);
});

test('puntuación base: escaleras', () => {
  assert.strictEqual(E.baseScore('smallStraight', [1, 2, 3, 4, 6]), 30);
  assert.strictEqual(E.baseScore('smallStraight', [3, 4, 5, 6, 6]), 30);
  assert.strictEqual(E.baseScore('smallStraight', [1, 2, 3, 5, 6]), 0);
  assert.strictEqual(E.baseScore('smallStraight', [1, 2, 3, 4, 5]), 30);
  assert.strictEqual(E.baseScore('largeStraight', [2, 3, 4, 5, 6]), 40);
  assert.strictEqual(E.baseScore('largeStraight', [1, 2, 3, 4, 6]), 0);
  assert.strictEqual(E.baseScore('yahtzee', [6, 6, 6, 6, 6]), 50);
  assert.strictEqual(E.baseScore('yahtzee', [6, 6, 6, 6, 5]), 0);
});

test('bono superior: 63 puntos => +35', () => {
  const card = E.newCard();
  // 3 de cada cara = 63
  [1, 2, 3, 4, 5, 6].forEach((f, i) => { card.scores[E.UPPER[i]] = f * 3; });
  const t = E.totals(card);
  assert.strictEqual(t.upper, 63);
  assert.strictEqual(t.upperBonus, 35);
  assert.strictEqual(t.total, 98);
  card.scores.sixes = 15; // 60 en total
  assert.strictEqual(E.totals(card).upperBonus, 0);
});

test('Yahtzee extra: bono de 100 y comodín', () => {
  const card = E.newCard();
  E.applyScore(card, 'yahtzee', [4, 4, 4, 4, 4]);
  assert.strictEqual(card.scores.yahtzee, 50);
  assert.strictEqual(card.yahtzeeBonuses, 0);
  // Segundo Yahtzee de cuatros: casilla superior libre => obligatoria
  assert.deepStrictEqual(E.legalCategories(card, [4, 4, 4, 4, 4]), ['fours']);
  const r = E.applyScore(card, 'fours', [4, 4, 4, 4, 4]);
  assert.strictEqual(r.score, 20);
  assert.strictEqual(r.bonus, 100);
  assert.strictEqual(E.totals(card).total, 50 + 20 + 100);
  // Tercer Yahtzee de cuatros: superior ocupada => casillas inferiores libres, comodín completo
  const legal = E.legalCategories(card, [4, 4, 4, 4, 4]);
  assert.ok(legal.includes('fullHouse') && !legal.includes('fours') && !legal.includes('ones'));
  assert.strictEqual(E.applyScore(card, 'largeStraight', [4, 4, 4, 4, 4]).score, 40);
  assert.strictEqual(card.yahtzeeBonuses, 2);
});

test('Yahtzee anotado como 0: no hay bono pero sí comodín', () => {
  const card = E.newCard();
  E.applyScore(card, 'yahtzee', [1, 2, 3, 4, 6]); // sacrificio
  assert.strictEqual(card.scores.yahtzee, 0);
  const r = E.applyScore(card, 'sixes', [6, 6, 6, 6, 6]);
  assert.strictEqual(r.bonus, 0);
  assert.strictEqual(card.yahtzeeBonuses, 0);
});

test('categoría ilegal lanza error', () => {
  const card = E.newCard();
  E.applyScore(card, 'chance', [1, 2, 3, 4, 5]);
  assert.throws(() => E.applyScore(card, 'chance', [1, 2, 3, 4, 5]));
});

test('PRNG con semilla es reproducible y uniforme', () => {
  const a = E.makeRng(123), b = E.makeRng(123);
  for (let i = 0; i < 100; i++) assert.strictEqual(E.rollDie(a), E.rollDie(b));
  const rng = E.makeRng(7);
  const obs = [0, 0, 0, 0, 0, 0];
  const N = 600000;
  for (let i = 0; i < N; i++) obs[E.rollDie(rng) - 1]++;
  assert.ok(E.chiSquareUniform(obs) < 20, 'chi² demasiado alto: ' + E.chiSquareUniform(obs));
  obs.forEach(o => near(o / N, 1 / 6, 0.003, 'frecuencia relativa'));
});

test('probabilidades exactas de una tirada', () => {
  const p = E.exactSingleRollProbabilities();
  assert.strictEqual(p.yahtzee.favorable, 6);
  assert.strictEqual(p.largeStraight.favorable, 240);
  assert.strictEqual(p.fullHouse.favorable, 300);
  assert.strictEqual(p.fourOfKind.favorable, 150 + 6);
  assert.strictEqual(p.smallStraight.favorable, 1200);
  assert.strictEqual(p.threeOfKind.favorable, 1200 + 300 + 150 + 6); // 3+1+1, 3+2, 4+1, 5
});

test('Yahtzee en un turno: valor exacto ≈ 4.6 %', () => {
  near(E.exactYahtzeeInTurn(1), 6 / 7776, 1e-12);
  near(E.exactYahtzeeInTurn(3), 0.0460, 0.0005);
});

test('Welford coincide con cálculo directo', () => {
  const xs = [3, 5, 8, 1, 9, 2, 7];
  const s = new E.RunningStats();
  xs.forEach(x => s.add(x));
  const mean = xs.reduce((a, b) => a + b) / xs.length;
  const v = xs.reduce((a, x) => a + (x - mean) ** 2, 0) / (xs.length - 1);
  near(s.mean, mean, 1e-12);
  near(s.variance, v, 1e-12);
});

test('partidas completas: 13 casillas llenas, puntaje coherente', () => {
  const rng = E.makeRng(99);
  for (let g = 0; g < 500; g++) {
    const game = E.playGame([E.computerStrategy, E.computerStrategy], rng);
    game.cards.forEach(c => assert.ok(E.isCardComplete(c)));
    game.totals.forEach(t => assert.ok(t.total >= 0 && t.total <= 1575));
  }
});

test('la computadora supera claramente a un jugador que decide al azar', () => {
  const randomPlayer = {
    chooseKeep: (dice, r, card, rng) => dice.map(() => rng() < 0.5),
    chooseCategory: (dice, card, rng) => { const l = E.legalCategories(card, dice); return l[Math.floor(rng() * l.length)]; }
  };
  const rng = E.makeRng(2024);
  const pc = new E.RunningStats(), rd = new E.RunningStats();
  for (let i = 0; i < 2000; i++) {
    const game = E.playGame([E.computerStrategy, randomPlayer], rng);
    pc.add(game.scores[0]); rd.add(game.scores[1]);
  }
  console.log(`      computadora ${pc.mean.toFixed(1)} vs azar ${rd.mean.toFixed(1)}`);
  assert.ok(pc.mean > rd.mean + 100);
});

test('con estrategias iguales ningún jugador tiene ventaja (diferencia de medias dentro de 4 errores estándar)', () => {
  const rng = E.makeRng(2024);
  const a = new E.RunningStats(), b = new E.RunningStats();
  for (let i = 0; i < 4000; i++) {
    const game = E.playGame([E.computerStrategy, E.computerStrategy], rng);
    a.add(game.scores[0]); b.add(game.scores[1]);
  }
  const se = Math.sqrt(a.sem ** 2 + b.sem ** 2);
  console.log(`      J1 ${a.mean.toFixed(1)} vs J2 ${b.mean.toFixed(1)} (EE de la diferencia ${se.toFixed(2)})`);
  assert.ok(Math.abs(a.mean - b.mean) < 4 * se);
});


