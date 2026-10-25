/*
 * app.js - Interfaz: juego interactivo de 2 jugadores y experimentos Montecarlo.
 * Depende de YahtzeeEngine (engine.js) y Charts (charts.js).
 */
(function () {
  'use strict';
  const E = window.YahtzeeEngine;
  const $ = id => document.getElementById(id);

  // ------------------------------------------------------------ Formato
  const num = (x, d = 2) => Number(x).toFixed(d).replace('.', ',');
  const pct = (x, d = 2) => num(x * 100, d) + ' %';
  const int = x => Number(x).toLocaleString('es');
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const readInt = (id, min, max) => {
    const v = Math.round(Number($(id).value));
    const c = Math.min(max, Math.max(min, isNaN(v) ? min : v));
    $(id).value = c;
    return c;
  };

  // ================================================================ JUEGO
  const PIPS = { 0: [], 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
  const G = {};          // estado de la partida
  const live = {};       // estadísticas en vivo

  function playerLabel(i) {
    const t = G.players[i].type;
    return 'J' + (i + 1) + (t === 'human' ? '' : ' 🤖');
  }
  const isHumanTurn = () => !G.over && G.players[G.current].type === 'human';

  function newGame() {
    G.token = (G.token || 0) + 1;                       // cancela turnos de bots pendientes
    G.players = ['p1type', 'p2type'].map(id => ({ type: $(id).value, card: E.newCard() }));
    G.current = 0;
    G.dice = [0, 0, 0, 0, 0];
    G.keep = [false, false, false, false, false];
    G.rollsLeft = E.MAX_ROLLS;
    G.rolled = false;
    G.over = false;
    G.busy = false;
    G.rng = Math.random;
    live.faces = [0, 0, 0, 0, 0, 0];
    live.stats = new E.RunningStats();
    live.yahtzeeTurns = 0;
    live.turns = 0;
    $('modalBg').hidden = true;
    renderGame();
    maybeBotTurn();
  }

  function roll(animate = true) {
    if (G.over || G.rollsLeft === 0) return;
    const keep = G.rolled ? G.keep : [false, false, false, false, false];
    const next = E.rollDice(G.rng, G.dice, keep);
    for (let i = 0; i < E.NUM_DICE; i++) {
      if (!keep[i]) { live.faces[next[i] - 1]++; live.stats.add(next[i]); }   // solo dados recién lanzados
    }
    G.dice = next;
    G.rollsLeft--;
    G.rolled = true;
    if (G.rollsLeft === 0) G.keep = [false, false, false, false, false];
    renderGame();
    if (animate) document.querySelectorAll('#diceRow .die').forEach((el, i) => { if (!keep[i]) el.classList.add('rolling'); });
  }

  function toggleKeep(i) {
    if (!isHumanTurn() || !G.rolled || G.rollsLeft === 0) return;
    G.keep[i] = !G.keep[i];
    renderGame();
  }

  function pick(cat) {
    const card = G.players[G.current].card;
    if (G.over || !G.rolled || !E.legalCategories(card, G.dice).includes(cat)) return;
    if (E.isYahtzee(G.dice)) live.yahtzeeTurns++;
    live.turns++;
    E.applyScore(card, cat, G.dice);
    endTurn();
  }

  function endTurn() {
    if (G.players.every(p => E.isCardComplete(p.card))) { finishGame(); return; }
    G.current = 1 - G.current;
    G.dice = [0, 0, 0, 0, 0];
    G.keep = [false, false, false, false, false];
    G.rollsLeft = E.MAX_ROLLS;
    G.rolled = false;
    renderGame();
    maybeBotTurn();
  }

  function finishGame() {
    G.over = true;
    renderGame();
    const t = G.players.map(p => E.totals(p.card).total);
    const title = t[0] === t[1] ? '¡Empate!' : '🏆 Gana el Jugador ' + (t[0] > t[1] ? 1 : 2);
    $('modalTitle').textContent = title;
    $('modalScores').innerHTML = `Jugador 1: <strong>${t[0]}</strong> puntos<br>Jugador 2: <strong>${t[1]}</strong> puntos`;
    $('modalBg').hidden = false;
    $('modalNew').focus();
  }

  // Turno automático de un jugador computador.
  async function maybeBotTurn() {
    const player = G.players[G.current];
    if (G.over || player.type === 'human') return;
    const token = G.token;
    const strat = E.STRATEGIES[player.type];
    G.busy = true; renderGame();
    const alive = () => token === G.token;
    await delay(600); if (!alive()) return;
    roll();
    while (G.rollsLeft > 0) {
      await delay(700); if (!alive()) return;
      const keep = strat.chooseKeep(G.dice, G.rollsLeft, player.card, G.rng);
      if (keep.every(Boolean)) break;
      G.keep = keep; renderGame();
      await delay(700); if (!alive()) return;
      roll();
    }
    await delay(800); if (!alive()) return;
    G.busy = false;
    pick(strat.chooseCategory(G.dice, player.card, G.rng));
  }

  // ----------------------------------------------------------- Render juego
  function renderGame() {
    const human = isHumanTurn();
    const card = G.players[G.current].card;

    // Estado
    if (G.over) {
      $('turnText').textContent = 'Juego terminado';
      $('turnMeta').textContent = '';
    } else {
      const round = G.players[G.current].card ? Object.values(card.scores).filter(v => v !== null).length + 1 : 1;
      $('turnText').textContent = `Turno del Jugador ${G.current + 1}${human ? '' : ' (computador)'}`;
      $('turnMeta').textContent = `Ronda ${round} de 13 · tiradas restantes: ${G.rollsLeft}`;
    }

    // Dados
    $('diceRow').innerHTML = G.dice.map((v, i) => {
      const pips = Array.from({ length: 9 }, (_, k) => PIPS[v].includes(k + 1) ? '<span class="pip"></span>' : '<span></span>').join('');
      const locked = G.keep[i] && G.rolled && G.rollsLeft > 0;
      const dis = !human || !G.rolled || G.rollsLeft === 0;
      return `<button class="die${locked ? ' locked' : ''}" data-i="${i}" ${dis ? 'disabled' : ''} aria-pressed="${locked}" aria-label="Dado ${i + 1}: ${v || 'sin lanzar'}${locked ? ', retenido' : ''}">${pips}${locked ? '<span class="tag">RETENIDO</span>' : ''}</button>`;
    }).join('');

    // Pista y botón
    const rollBtn = $('rollBtn');
    rollBtn.disabled = !human || G.rollsLeft === 0;
    rollBtn.textContent = G.rolled ? `🎲 Volver a lanzar (${G.rollsLeft})` : '🎲 Lanzar dados';
    let hint = '';
    if (G.over) hint = 'Pulsa «Nuevo juego» para jugar otra vez.';
    else if (!human) hint = 'El computador está jugando…';
    else if (!G.rolled) hint = 'Lanza los dados para comenzar tu turno.';
    else if (G.rollsLeft > 0) hint = 'Haz clic en los dados que quieras retener y vuelve a lanzar, o elige una casilla de la hoja.';
    else hint = 'Sin tiradas: elige una casilla de la hoja.';
    $('hint').textContent = hint;

    renderScoreTable(human);
    renderLive();
  }

  function renderScoreTable(human) {
    const rows = [];
    const cur = G.current;
    const legal = (human && G.rolled) ? E.legalCategories(G.players[cur].card, G.dice) : [];
    const T = G.players.map(p => E.totals(p.card));

    rows.push(`<thead><tr><th>Casilla</th>${[0, 1].map(i => `<th class="${!G.over && i === cur ? 'active' : ''}">${playerLabel(i)}</th>`).join('')}</tr></thead><tbody>`);

    const catRow = cat => {
      const cells = [0, 1].map(p => {
        const v = G.players[p].card.scores[cat];
        if (v !== null) return `<td class="filled">${v}</td>`;
        if (p === cur && human && G.rolled) {
          const pot = E.scoreFor(G.players[p].card, cat, G.dice);
          return legal.includes(cat)
            ? `<td class="pick" tabindex="0" role="button" data-cat="${cat}" aria-label="Anotar ${pot} en ${E.NAMES[cat]}"><span class="pot">${pot}</span></td>`
            : `<td class="blocked" title="No permitido por la regla del comodín"><span class="pot">${pot}</span></td>`;
        }
        return '<td class="muted">–</td>';
      }).join('');
      return `<tr><td>${E.NAMES[cat]}</td>${cells}</tr>`;
    };

    E.UPPER.forEach(c => rows.push(catRow(c)));
    rows.push(`<tr class="sub"><td>Subtotal superior (bono con 63)</td>${T.map(t => `<td>${t.upper} / 63</td>`).join('')}</tr>`);
    rows.push(`<tr class="sub"><td>Bono superior (+35)</td>${T.map(t => `<td>${t.upperBonus}</td>`).join('')}</tr>`);
    E.LOWER.forEach(c => rows.push(catRow(c)));
    rows.push(`<tr class="sub"><td>Bono Yahtzee extra (+100 c/u)</td>${T.map(t => `<td>${t.yahtzeeBonus}</td>`).join('')}</tr>`);
    rows.push(`<tr class="total"><td>TOTAL</td>${T.map(t => `<td>${t.total}</td>`).join('')}</tr></tbody>`);
    $('scoreTable').innerHTML = rows.join('');

    const joker = human && G.rolled && E.isJoker(G.players[cur].card, G.dice);
    $('jokerNotice').hidden = !joker;
    if (joker) {
      const only = legal.length === 1 && E.UPPER.includes(legal[0]);
      $('jokerNotice').textContent = '¡Yahtzee extra! Regla del comodín: ' + (only
        ? `debes anotar en ${E.NAMES[legal[0]]}.`
        : 'elige una casilla inferior libre (Full House y escaleras puntúan completo).');
    }
  }

  function renderLive() {
    const total = live.faces.reduce((a, b) => a + b, 0);
    $('liveFreq').innerHTML = live.faces.map((n, i) => {
      const f = total ? n / total : 0;
      const w = Math.min(100, f / 0.3 * 100);
      return `<div class="freq"><span><strong>${i + 1}</strong></span>
        <div class="bar"><i style="width:${w}%"></i><b style="left:${(1 / 6) / 0.3 * 100}%" title="1/6"></b></div>
        <span class="small">${n} · ${pct(f, 1)}</span></div>`;
    }).join('');
    const chi = E.chiSquareUniform(live.faces);
    const verdict = total < 30 ? 'faltan datos' : (chi < E.CHI2_CRIT_5_DF ? 'compatible con uniforme' : 'por encima del crítico');
    $('liveKv').innerHTML = `
      <div><span>Dados registrados</span><strong>${total}</strong></div>
      <div><span>Media (teórica 3,5)</span><strong>${total ? num(live.stats.mean, 3) : '–'}</strong></div>
      <div><span>χ² (crítico 11,07)</span><strong>${total ? num(chi, 2) : '–'}</strong><span>${verdict}</span></div>
      <div><span>Turnos con Yahtzee</span><strong>${live.yahtzeeTurns} / ${live.turns}</strong></div>`;
  }

  // ======================================================== MONTECARLO
  const redraws = {};
  function registerRedraw(id, fn) { redraws[id] = fn; fn(); }
  function redrawAll() {
    Object.entries(redraws).forEach(([id, fn]) => {
      if (!$('panel-mc').hidden) fn();
    });
  }

  // Ejecuta `step(desde, hasta)` en bloques para no congelar la interfaz.
  async function runChunked(total, chunk, step, progressEl) {
    for (let done = 0; done < total;) {
      const end = Math.min(total, done + chunk);
      step(done, end);
      done = end;
      progressEl.style.width = (done / total * 100) + '%';
      await delay(0);
    }
  }

  function setBusy(btn, busy) { btn.disabled = busy; btn.textContent = busy ? 'Simulando…' : 'Ejecutar'; }
  function showResult(id, html) { const el = $(id); el.hidden = false; el.innerHTML = html; }
  const c1 = () => Charts.css('--series-1');
  const c2 = () => Charts.css('--series-2');

  // ---------------------------------------------------- Experimento 1: dado
  async function runExp1() {
    const N = readInt('n1', 10, 5000000);
    const rng = E.makeRng($('seed1').value);
    const cps = E.logCheckpoints(N, 12);
    const xs = [], means = [], counts = [0, 0, 0, 0, 0, 0];
    const st = new E.RunningStats();
    let ptr = 0;
    setBusy($('run1'), true);
    await runChunked(N, 50000, (a, b) => {
      for (let i = a + 1; i <= b; i++) {
        const d = E.rollDie(rng);
        counts[d - 1]++; st.add(d);
        if (i === cps[ptr]) { xs.push(i); means.push(st.mean); ptr++; }
      }
    }, $('prog1'));
    setBusy($('run1'), false);

    const sigma = Math.sqrt(35 / 12);
    const lo = xs.map(n => 3.5 - 1.96 * sigma / Math.sqrt(n));
    const hi = xs.map(n => 3.5 + 1.96 * sigma / Math.sqrt(n));
    let inside = 0, tested = 0;
    xs.forEach((n, i) => { if (n >= 100) { tested++; if (means[i] >= lo[i] && means[i] <= hi[i]) inside++; } });
    const chi = E.chiSquareUniform(counts);

    registerRedraw('c1a', () => Charts.lineChart($('c1a'), {
      xs, xlog: true, ymin: 2.5, ymax: 4.5, yDigits: 1, xLabel: 'Número de lanzamientos n (escala log)', yLabel: 'Media acumulada',
      series: [{ ys: means, color: c1() }], ref: { y: 3.5, label: 'E[X] = 3,5' }, band: { lo, hi, color: c1() }
    }));
    registerRedraw('c1b', () => Charts.barChart($('c1b'), {
      labels: ['1', '2', '3', '4', '5', '6'], values: counts.map(c => c / N), color: c1(), yDigits: 3,
      ref: { y: 1 / 6, label: '1/6 = 0,1667' }, xLabel: 'Cara del dado', yLabel: 'Frecuencia relativa', ymax: 0.25
    }));
    showResult('r1', `Tras <strong>${int(N)}</strong> lanzamientos: media = <strong>${num(st.mean, 4)}</strong> (|error| = ${num(Math.abs(st.mean - 3.5), 4)}; error típico teórico σ/√N = ${num(sigma / Math.sqrt(N), 4)}). ` +
      `Frecuencias entre ${pct(Math.min(...counts) / N, 2)} y ${pct(Math.max(...counts) / N, 2)} (teórica 16,67 %). ` +
      `χ² = ${num(chi, 2)} (${chi < E.CHI2_CRIT_5_DF ? 'no se rechaza' : 'se rechaza'} la uniformidad con α = 0,05; crítico 11,07). ` +
      `Estadístico z = (X̄ − 3,5)/(σ/√N) = ${num((st.mean - 3.5) / (sigma / Math.sqrt(N)), 2)} (|z| < 1,96 ⇒ dentro de la banda al 95 %). ` +
      `La media acumulada estuvo dentro de la banda en ${inside} de ${tested} puntos de control con n ≥ 100 (no son independientes: una misma corrida puede pasar varios puntos seguidos cerca del borde; promediando sobre muchas corridas la cobertura es 95 %). ` +
      `<strong>La banda se estrecha como 1/√n: eso es la Ley de los Grandes Números en acción.</strong>`);
  }

  // ------------------------------------------ Experimento 2: 5 dados, 1 tirada
  const exp2 = { data: null };
  function drawExp2() {
    if (!exp2.data) return;
    const d = exp2.data, id = $('sel2').value, ev = d.series[id];
    const p = d.exact[id].p;
    Charts.lineChart($('c2'), {
      xs: d.xs, xlog: true, ymin: 0, ymax: Math.min(1, Math.max(p * 2.2, 0.01)), yDigits: 3,
      xLabel: 'Número de tiradas n (escala log)', yLabel: 'Frecuencia relativa acumulada',
      series: [{ ys: ev, color: c1() }], ref: { y: p, label: 'teórica ' + pct(p, 3) },
      band: { lo: d.xs.map(n => p - 1.96 * Math.sqrt(p * (1 - p) / n)), hi: d.xs.map(n => p + 1.96 * Math.sqrt(p * (1 - p) / n)), color: c1() }
    });
  }
  $('sel2').innerHTML = E.SINGLE_ROLL_EVENTS.map(e => `<option value="${e.id}">${e.label}</option>`).join('');
  $('sel2').value = 'yahtzee';
  $('sel2').addEventListener('change', drawExp2);

  async function runExp2() {
    const N = readInt('n2', 100, 5000000);
    const rng = E.makeRng($('seed2').value);
    const exact = E.exactSingleRollProbabilities();
    const cps = E.logCheckpoints(N, 12);
    const hits = {}, series = {};
    E.SINGLE_ROLL_EVENTS.forEach(e => { hits[e.id] = 0; series[e.id] = []; });
    const xs = [];
    let ptr = 0;
    const dice = new Array(5);
    setBusy($('run2'), true);
    await runChunked(N, 20000, (a, b) => {
      for (let i = a + 1; i <= b; i++) {
        for (let k = 0; k < 5; k++) dice[k] = E.rollDie(rng);
        const c = E.faceCounts(dice);
        for (const e of E.SINGLE_ROLL_EVENTS) if (e.test(c)) hits[e.id]++;
        if (i === cps[ptr]) { xs.push(i); for (const e of E.SINGLE_ROLL_EVENTS) series[e.id].push(hits[e.id] / i); ptr++; }
      }
    }, $('prog2'));
    setBusy($('run2'), false);

    let okCount = 0;
    const rows = E.SINGLE_ROLL_EVENTS.map(e => {
      const p = exact[e.id].p, ph = hits[e.id] / N;
      const half = 1.96 * Math.sqrt(p * (1 - p) / N);
      const ok = Math.abs(ph - p) <= half; if (ok) okCount++;
      return `<tr><td>${e.label}</td><td>${pct(p, 3)} <span class="muted small">(${exact[e.id].favorable}/${exact[e.id].total})</span></td><td>${pct(ph, 3)}</td><td>${pct(Math.abs(ph - p), 3)}</td><td>${pct(half, 3)}</td><td>${ok ? '✔ sí' : '✘ no'}</td></tr>`;
    });
    $('t2').querySelector('tbody').innerHTML = rows.join('');
    exp2.data = { xs, series, exact };
    registerRedraw('c2', drawExp2);
    showResult('r2', `Con <strong>${int(N)}</strong> tiradas, ${okCount} de ${E.SINGLE_ROLL_EVENTS.length} frecuencias quedaron dentro del IC 95 % construido con la probabilidad teórica (con 6 eventos se espera, en promedio, que 0,3 queden fuera solo por azar). El error absoluto es mayor para eventos frecuentes y relativamente mayor para los raros; en ambos casos decrece como 1/√N.`);
  }

  // -------------------------------------------- Experimento 3: Yahtzee en un turno
  function yahtzeeTurn(rng) {
    const dice = [0, 0, 0, 0, 0];
    for (let i = 0; i < 5; i++) dice[i] = Math.floor(rng() * 6) + 1;
    for (let r = 1; r < 3; r++) {
      const c = [0, 0, 0, 0, 0, 0];
      for (let i = 0; i < 5; i++) c[dice[i] - 1]++;
      let face = 0;
      for (let k = 1; k < 6; k++) if (c[k] > c[face]) face = k;
      if (c[face] === 5) return true;
      for (let i = 0; i < 5; i++) if (dice[i] !== face + 1) dice[i] = Math.floor(rng() * 6) + 1;
    }
    return dice.every(d => d === dice[0]);
  }

  async function runExp3() {
    const N = readInt('n3', 100, 3000000);
    const rng = E.makeRng($('seed3').value);
    const exact = E.exactYahtzeeInTurn(3);
    const cps = E.logCheckpoints(N, 12);
    const xs = [], fs = [];
    let hits = 0, ptr = 0;
    setBusy($('run3'), true);
    await runChunked(N, 20000, (a, b) => {
      for (let i = a + 1; i <= b; i++) {
        if (yahtzeeTurn(rng)) hits++;
        if (i === cps[ptr]) { xs.push(i); fs.push(hits / i); ptr++; }
      }
    }, $('prog3'));
    setBusy($('run3'), false);

    const band = n => 1.96 * Math.sqrt(exact * (1 - exact) / n);
    registerRedraw('c3', () => Charts.lineChart($('c3'), {
      xs, xlog: true, ymin: 0, ymax: 0.12, yDigits: 2, xLabel: 'Número de turnos n (escala log)', yLabel: 'Frecuencia relativa de Yahtzee',
      series: [{ ys: fs, color: c1() }], ref: { y: exact, label: 'exacta ' + pct(exact, 3) },
      band: { lo: xs.map(n => exact - band(n)), hi: xs.map(n => exact + band(n)), color: c1() }
    }));
    const ph = hits / N;
    showResult('r3', `<strong>${int(hits)}</strong> Yahtzees en <strong>${int(N)}</strong> turnos → frecuencia <strong>${pct(ph, 3)}</strong> frente a la probabilidad exacta <strong>${pct(exact, 3)}</strong> ` +
      `(error ${pct(Math.abs(ph - exact), 3)}; IC 95 % teórico ±${pct(band(N), 3)}). Como el evento es raro, con N pequeño la frecuencia oscila mucho: la convergencia es lenta pero segura.`);
  }

  // -------------------------------------------------- Experimento 4: partidas
  async function runExp4() {
    const M = readInt('n4', 10, 200000);
    const rng = E.makeRng($('seed4').value);
    const strats = [E.computerStrategy, E.computerStrategy];
    const st = [new E.RunningStats(), new E.RunningStats()];
    const cps = E.logCheckpoints(M, 12);
    const xs = [], m1 = [], m2 = [];
    const wins = [0, 0], ties = { n: 0 }, yz = [0, 0];
    const BIN = 20;
    const hist = new Map();
    let ptr = 0;
    setBusy($('run4'), true);
    await runChunked(M, 200, (a, b) => {
      for (let g = a + 1; g <= b; g++) {
        const r = E.playGame(strats, rng);
        r.scores.forEach((s, p) => { st[p].add(s); yz[p] += r.yahtzeeTurns[p]; });
        if (r.scores[0] > r.scores[1]) wins[0]++; else if (r.scores[1] > r.scores[0]) wins[1]++; else ties.n++;
        const bin = Math.floor(r.scores[0] / BIN) * BIN;
        hist.set(bin, (hist.get(bin) || 0) + 1);
        if (g === cps[ptr]) { xs.push(g); m1.push(st[0].mean); m2.push(st[1].mean); ptr++; }
      }
    }, $('prog4'));
    setBusy($('run4'), false);

    $('t4').querySelector('tbody').innerHTML = [0, 1].map(p =>
      `<tr><td>Jugador ${p + 1} (${strats[p].label})</td><td>${num(st[p].mean, 2)}</td><td>${num(st[p].std, 2)}</td><td>${num(st[p].ci95, 2)}</td><td>${st[p].min} – ${st[p].max}</td><td>${int(wins[p])} (${pct(wins[p] / M, 1)})</td><td>${num(yz[p] / M, 3)}</td></tr>`).join('');

    const keys = Array.from(hist.keys());
    const lo = Math.min(...keys), hi = Math.max(...keys);
    const labels = [], vals = [];
    for (let k = lo; k <= hi; k += BIN) { labels.push(String(k)); vals.push((hist.get(k) || 0) / M); }
    registerRedraw('c4a', () => Charts.barChart($('c4a'), { labels, values: vals, color: c1(), yDigits: 3, xLabel: `Puntaje total (intervalos de ${BIN})`, yLabel: 'Frecuencia relativa' }));

    const sd = st[0].std, mu = st[0].mean;
    const tail = xs.map((n, i) => ({ n, i })).filter(o => o.n >= Math.min(20, M / 2));
    const all = tail.flatMap(o => [m1[o.i], m2[o.i]]);
    const pad = (Math.max(...all) - Math.min(...all)) * 0.15 || 1;
    registerRedraw('c4b', () => Charts.lineChart($('c4b'), {
      xs, xlog: true, ymin: Math.min(...all) - pad, ymax: Math.max(...all) + pad, yDigits: 0,
      xLabel: 'Número de partidas n (escala log)', yLabel: 'Puntaje medio acumulado',
      series: [{ ys: m1, color: c1() }, { ys: m2, color: c2() }],
      band: { lo: xs.map(n => mu - 1.96 * sd / Math.sqrt(n)), hi: xs.map(n => mu + 1.96 * sd / Math.sqrt(n)), color: c1() }
    }));

    const diff = st[0].mean - st[1].mean;
    const seDiff = Math.sqrt(st[0].sem ** 2 + st[1].sem ** 2);
    showResult('r4', `En <strong>${int(M)}</strong> partidas: Jugador 1 gana ${pct(wins[0] / M, 1)}, Jugador 2 ${pct(wins[1] / M, 1)} y hay ${pct(ties.n / M, 1)} de empates. ` +
      `Diferencia de medias J1 − J2 = <strong>${num(diff, 2)}</strong> ± ${num(1.96 * seDiff, 2)} (IC 95 %). ` +
      (Math.abs(diff) <= 1.96 * seDiff
        ? 'Como ambas computadoras deciden igual, la diferencia no es estadísticamente distinta de 0: empezar primero no da ventaja y la simulación lo confirma.'
        : 'La diferencia queda fuera del IC (ocurre ≈ 5 % de las veces por azar): repite con otra semilla o más partidas.'));
  }

  // ================================================================ EVENTOS
  $('newGame').addEventListener('click', newGame);
  $('modalNew').addEventListener('click', newGame);
  $('modalClose').addEventListener('click', () => { $('modalBg').hidden = true; });
  $('rollBtn').addEventListener('click', () => { if (isHumanTurn()) roll(); });
  $('diceRow').addEventListener('click', e => { const b = e.target.closest('.die'); if (b) toggleKeep(Number(b.dataset.i)); });
  $('scoreTable').addEventListener('click', e => { const td = e.target.closest('td.pick'); if (td && isHumanTurn()) pick(td.dataset.cat); });
  $('scoreTable').addEventListener('keydown', e => {
    const td = e.target.closest('td.pick');
    if (td && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); if (isHumanTurn()) pick(td.dataset.cat); }
  });
  $('p1type').addEventListener('change', newGame);
  $('p2type').addEventListener('change', newGame);

  $('run1').addEventListener('click', runExp1);
  $('run2').addEventListener('click', runExp2);
  $('run3').addEventListener('click', runExp3);
  $('run4').addEventListener('click', runExp4);

  // Pestañas
  const tabs = ['play', 'mc', 'method'];
  tabs.forEach(t => $('tab-' + t).addEventListener('click', () => {
    tabs.forEach(o => {
      $('tab-' + o).setAttribute('aria-selected', String(o === t));
      $('panel-' + o).hidden = o !== t;
    });
    if (t === 'mc') requestAnimationFrame(redrawAll);
  }));

  window.addEventListener('resize', redrawAll);
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redrawAll);

  newGame();
})();
