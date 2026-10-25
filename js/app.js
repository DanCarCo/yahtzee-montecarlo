/*
 * app.js - Interfaz de la aplicación: el juego de 2 jugadores y los experimentos Montecarlo.
 *
 * Este archivo se encarga de lo que se ve en pantalla (botones, tablas, gráficos).
 * Las reglas y los cálculos están en engine.js (YahtzeeEngine) y los gráficos en charts.js.
 */
(function () {
  'use strict';
  const E = window.YahtzeeEngine;                 // motor del juego (engine.js)
  const $ = id => document.getElementById(id);    // atajo para no escribir document.getElementById todo el tiempo

  // ------------------------------------------------------------ Formato
  // Funciones chiquitas para mostrar números como se escriben en español (coma decimal).
  const num = (x, d = 2) => Number(x).toFixed(d).replace('.', ',');   // 3.5 -> "3,50"
  const pct = (x, d = 2) => num(x * 100, d) + ' %';                   // 0.5 -> "50,00 %"
  const int = x => Number(x).toLocaleString('es');                    // 100000 -> "100.000"
  const delay = ms => new Promise(r => setTimeout(r, ms));            // pausa (para usar con await)

  // Lee un número de una caja de texto y lo obliga a estar entre min y max
  // (si el usuario escribe algo raro o fuera de rango, lo corregimos).
  const readInt = (id, min, max) => {
    const v = Math.round(Number($(id).value));
    const c = Math.min(max, Math.max(min, isNaN(v) ? min : v));
    $(id).value = c;
    return c;
  };

  // HTML de una "tarjeta de estadística": icono, nombre, valor grande y una nota opcional.
  function tile(icon, label, value, note) {
    return `<div class="tile"><div class="lbl">${Icons.svg(icon, 16)}${label}</div><div class="val">${value}</div>${note ? `<div class="note">${note}</div>` : ''}</div>`;
  }

  // ================================================================ JUEGO
  // Posiciones (1 a 9) de los puntos en una cuadrícula de 3x3 para dibujar cada cara del dado.
  // Ejemplo: el 5 usa las esquinas y el centro. El 0 es un dado todavía sin lanzar.
  const PIPS = { 0: [], 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };

  // HTML de un dado con valor v (0 = sin lanzar): un botón con 9 celdas y puntos en las que toquen.
  // "cls" son clases extra, "attrs" atributos del botón y "tag" un texto opcional (RETENIDO).
  function dieHTML(v, cls, attrs, tag) {
    const pips = Array.from({ length: 9 }, (_, k) => PIPS[v].includes(k + 1) ? '<span class="pip"></span>' : '<span></span>').join('');
    return `<button class="die${cls ? ' ' + cls : ''}" ${attrs || ''}>${pips}${tag || ''}</button>`;
  }

  // G guarda TODO el estado de la partida actual; live guarda las estadísticas en vivo.
  const G = {};
  const live = {};

  // Etiqueta de columna: "J1", "J2" y un robot si es la computadora.
  function playerLabel(i) {
    const t = G.players[i].type;
    return 'J' + (i + 1) + (t === 'human' ? '' : ' · PC');
  }
  // ¿Le toca jugar a una persona? (para habilitar o no los botones)
  const isHumanTurn = () => !G.over && G.players[G.current].type === 'human';

  // Empieza una partida nueva: reinicia todo el estado y las estadísticas.
  function newGame() {
    // "token" sirve para cancelar turnos de la computadora que quedaron pendientes
    // (si se pulsa "Nuevo juego" mientras ella estaba jugando).
    G.token = (G.token || 0) + 1;
    G.players = ['p1type', 'p2type'].map(id => ({ type: $(id).value, card: E.newCard() }));
    G.current = 0;                          // empieza el jugador 1 (índice 0)
    G.dice = [0, 0, 0, 0, 0];               // 0 = dado sin lanzar
    G.keep = [false, false, false, false, false];
    G.rollsLeft = E.MAX_ROLLS;
    G.rolled = false;                       // si ya se lanzó en este turno
    G.over = false;
    G.busy = false;
    G.rng = Math.random;                    // en el juego normal usamos Math.random (sin semilla)
    live.faces = [0, 0, 0, 0, 0, 0];
    live.stats = new E.RunningStats();
    live.yahtzeeTurns = 0;
    live.turns = 0;
    $('modalBg').hidden = true;
    renderGame();
    maybeBotTurn();                         // si el jugador 1 es la computadora, que juegue
  }

  // Lanza los dados no retenidos.
  function roll(animate = true) {
    if (G.over || G.rollsLeft === 0) return;
    // En el primer lanzamiento se lanzan los 5 dados, sin importar "keep".
    const keep = G.rolled ? G.keep : [false, false, false, false, false];
    const next = E.rollDice(G.rng, G.dice, keep);
    for (let i = 0; i < E.NUM_DICE; i++) {
      // Solo contamos los dados recién lanzados: si contáramos también los retenidos,
      // un mismo valor se contaría varias veces y los datos no serían independientes.
      if (!keep[i]) { live.faces[next[i] - 1]++; live.stats.add(next[i]); }
    }
    G.dice = next;
    G.rollsLeft--;
    G.rolled = true;
    if (G.rollsLeft === 0) G.keep = [false, false, false, false, false];
    renderGame();
    // si salió Yahtzee (5 dados iguales) celebramos con aviso y confeti
    if (E.isYahtzee(G.dice)) Fx.celebrate('¡YAHTZEE!');
    // animación de giro solo en los dados que se lanzaron
    if (animate) document.querySelectorAll('#diceRow .die').forEach((el, i) => { if (!keep[i]) el.classList.add('rolling'); });
  }

  // Retener / soltar un dado (solo en el turno de una persona y después de lanzar).
  function toggleKeep(i) {
    if (!isHumanTurn() || !G.rolled || G.rollsLeft === 0) return;
    G.keep[i] = !G.keep[i];
    renderGame();
  }

  // Anota los dados actuales en la casilla "cat" y termina el turno.
  function pick(cat) {
    const card = G.players[G.current].card;
    // validaciones: partida activa, ya se lanzó y la casilla es legal
    if (G.over || !G.rolled || !E.legalCategories(card, G.dice).includes(cat)) return;
    if (E.isYahtzee(G.dice)) live.yahtzeeTurns++;
    live.turns++;
    E.applyScore(card, cat, G.dice);
    G.pop = { p: G.current, cat, until: Date.now() + 900 };   // para animar el puntaje recién anotado
    endTurn();
  }

  // Pasa al otro jugador, o termina la partida si ya se llenaron todas las casillas.
  function endTurn() {
    if (G.players.every(p => E.isCardComplete(p.card))) { finishGame(); return; }
    G.current = 1 - G.current;              // alterna entre 0 y 1
    G.dice = [0, 0, 0, 0, 0];
    G.keep = [false, false, false, false, false];
    G.rollsLeft = E.MAX_ROLLS;
    G.rolled = false;
    renderGame();
    maybeBotTurn();                         // si ahora le toca a la computadora, que juegue
  }

  // Muestra la ventana final con el ganador.
  function finishGame() {
    G.over = true;
    renderGame();
    const t = G.players.map(p => E.totals(p.card).total);
    const title = t[0] === t[1] ? '¡Empate!' : 'Gana el Jugador ' + (t[0] > t[1] ? 1 : 2);
    if (t[0] !== t[1]) Fx.celebrate(title);   // confeti para el ganador
    $('modalTitle').textContent = title;
    $('modalScores').innerHTML = `Jugador 1: <strong>${t[0]}</strong> puntos<br>Jugador 2: <strong>${t[1]}</strong> puntos`;
    $('modalBg').hidden = false;
    $('modalNew').focus();
  }

  // Turno automático de la computadora. Es async para poder poner pausas con await
  // y que se vea lo que hace (si no, jugaría todo de golpe).
  async function maybeBotTurn() {
    const player = G.players[G.current];
    if (G.over || player.type === 'human') return;
    const token = G.token;
    const strat = E.STRATEGIES[player.type];
    G.busy = true; renderGame();
    // Después de cada pausa revisamos que no hayan empezado un juego nuevo; si pasó, salimos.
    const alive = () => token === G.token;
    await delay(600); if (!alive()) return;
    roll();                                 // primer lanzamiento
    while (G.rollsLeft > 0) {
      await delay(700); if (!alive()) return;
      const keep = strat.chooseKeep(G.dice, G.rollsLeft, player.card, G.rng);
      if (keep.every(Boolean)) break;       // si decide retener todo, deja de lanzar
      G.keep = keep; renderGame();          // mostramos qué dados retiene
      await delay(700); if (!alive()) return;
      roll();
    }
    await delay(800); if (!alive()) return;
    G.busy = false;
    pick(strat.chooseCategory(G.dice, player.card, G.rng));
  }

  // ----------------------------------------------------------- Render juego
  // Redibuja toda la parte del juego según el estado actual (G).
  function renderGame() {
    const human = isHumanTurn();
    const card = G.players[G.current].card;

    // Texto del turno y de la ronda
    if (G.over) {
      $('turnText').textContent = 'Juego terminado';
      $('turnMeta').textContent = '';
    } else {
      // La ronda es (casillas ya llenas del jugador actual) + 1
      const round = G.players[G.current].card ? Object.values(card.scores).filter(v => v !== null).length + 1 : 1;
      $('turnText').textContent = `Turno del Jugador ${G.current + 1}${human ? '' : ' (computadora)'}`;
      $('turnMeta').textContent = `Ronda ${round} de 13 · tiradas restantes: ${G.rollsLeft}`;
    }

    // Dados: cada uno es un botón con 9 celdas (3x3); las que tienen punto llevan la clase "pip".
    $('diceRow').innerHTML = G.dice.map((v, i) => {
      const locked = G.keep[i] && G.rolled && G.rollsLeft > 0;
      const dis = !human || !G.rolled || G.rollsLeft === 0;   // deshabilitado si no se puede interactuar
      const attrs = `data-i="${i}" ${dis ? 'disabled' : ''} aria-pressed="${locked}" aria-label="Dado ${i + 1}: ${v || 'sin lanzar'}${locked ? ', retenido' : ''}"`;
      return dieHTML(v, locked ? 'locked' : '', attrs, locked ? '<span class="tag">RETENIDO</span>' : '');
    }).join('');

    // Botón de lanzar y mensaje de ayuda
    const rollBtn = $('rollBtn');
    rollBtn.disabled = !human || G.rollsLeft === 0;
    rollBtn.textContent = G.rolled ? `Volver a lanzar (${G.rollsLeft})` : 'Lanzar dados';
    let hint = '';
    if (G.over) hint = 'Pulsa «Nuevo juego» para jugar otra vez.';
    else if (!human) hint = 'La computadora está jugando…';
    else if (!G.rolled) hint = 'Lanza los dados para comenzar tu turno.';
    else if (G.rollsLeft > 0) hint = 'Haz clic en los dados que quieras retener y vuelve a lanzar, o elige una casilla de la hoja.';
    else hint = 'Sin tiradas: elige una casilla de la hoja.';
    $('hint').textContent = hint;

    renderPlayers();
    renderScoreTable(human);
    renderLive();
  }

  // Marcadores de los dos jugadores (avatar, nombre, rol y puntaje total).
  // El jugador en turno lleva la clase "active" (borde dorado) y la insignia EN TURNO.
  function renderPlayers() {
    const T = G.players.map(p => E.totals(p.card).total);
    $('players').innerHTML = G.players.map((p, i) => {
      const active = !G.over && i === G.current;
      const isBot = p.type !== 'human';
      return `<div class="pcard${active ? ' active' : ''}">${active ? '<span class="badge-turn">EN TURNO</span>' : ''}
        <div class="avatar">${Icons.svg(isBot ? 'bot' : 'user', 24)}</div>
        <div><div class="pname">Jugador ${i + 1}</div><div class="prole">${isBot ? 'Computadora' : 'Humano'}</div></div>
        <div class="ptotal">${T[i]}</div></div>`;
    }).join('');
  }

  // Dibuja la hoja de puntuación (una columna por jugador).
  function renderScoreTable(human) {
    const rows = [];
    const cur = G.current;
    // casillas donde se puede anotar ahora (vacío si no es turno de una persona o no ha lanzado)
    const legal = (human && G.rolled) ? E.legalCategories(G.players[cur].card, G.dice) : [];
    const T = G.players.map(p => E.totals(p.card));

    // encabezado; la columna del jugador en turno se resalta con la clase "active"
    rows.push(`<thead><tr><th>Casilla</th>${[0, 1].map(i => `<th class="${!G.over && i === cur ? 'active' : ''}">${playerLabel(i)}</th>`).join('')}</tr></thead><tbody>`);

    // Fila de una casilla. Cada celda puede estar: ya llena (muestra el puntaje),
    // disponible (muestra en cursiva lo que sumaría), bloqueada por el comodín, o vacía.
    const catRow = cat => {
      const cells = [0, 1].map(p => {
        const v = G.players[p].card.scores[cat];
        const col = (!G.over && p === cur) ? ' colact' : '';   // tinte para la columna del jugador en turno
        if (v !== null) {
          // si es la casilla recién anotada (menos de 0,9 s) se anima con "pop"
          const pop = G.pop && G.pop.p === p && G.pop.cat === cat && Date.now() < G.pop.until;
          return `<td class="filled${col}${pop ? ' pop' : ''}"><span>${v}</span></td>`;
        }
        if (p === cur && human && G.rolled) {
          const pot = E.scoreFor(G.players[p].card, cat, G.dice);   // puntaje potencial
          return legal.includes(cat)
            ? `<td class="pick${col}" tabindex="0" role="button" data-cat="${cat}" aria-label="Anotar ${pot} en ${E.NAMES[cat]}"><span class="pot">${pot}</span></td>`
            : `<td class="blocked${col}" title="No permitido por la regla del comodín"><span class="pot">${pot}</span></td>`;
        }
        return `<td class="muted${col}">–</td>`;
      }).join('');
      return `<tr><td>${E.NAMES[cat]}</td>${cells}</tr>`;
    };

    E.UPPER.forEach(c => rows.push(catRow(c)));
    rows.push(`<tr class="sub"><td>Subtotal superior</td>${T.map(t => `<td>${t.upper} / 63</td>`).join('')}</tr>`);
    rows.push(`<tr class="sub"><td>Bono superior (+35)</td>${T.map(t => `<td>${t.upperBonus}</td>`).join('')}</tr>`);
    E.LOWER.forEach(c => rows.push(catRow(c)));
    rows.push(`<tr class="sub"><td>Bono Yahtzee extra (+100 c/u)</td>${T.map(t => `<td>${t.yahtzeeBonus}</td>`).join('')}</tr>`);
    rows.push(`<tr class="total"><td>TOTAL</td>${T.map(t => `<td>${t.total}</td>`).join('')}</tr></tbody>`);
    $('scoreTable').innerHTML = rows.join('');

    // Aviso cuando sale un Yahtzee extra y aplica la regla del comodín
    const joker = human && G.rolled && E.isJoker(G.players[cur].card, G.dice);
    $('jokerNotice').hidden = !joker;
    if (joker) {
      const only = legal.length === 1 && E.UPPER.includes(legal[0]);   // ¿solo queda una casilla permitida?
      $('jokerNotice').textContent = '¡Yahtzee extra! Regla del comodín: ' + (only
        ? `debes anotar en ${E.NAMES[legal[0]]}.`
        : 'elige una casilla inferior libre (Full House y escaleras puntúan completo).');
    }
  }

  // Panel de estadísticas en vivo: frecuencia de cada cara, media y chi-cuadrado.
  function renderLive() {
    const total = live.faces.reduce((a, b) => a + b, 0);
    $('liveFreq').innerHTML = live.faces.map((n, i) => {
      const f = total ? n / total : 0;                 // frecuencia relativa de la cara
      const w = Math.min(100, f / 0.3 * 100);          // ancho de la barra (la escala llega hasta 30 %)
      // la rayita vertical marca el valor teórico 1/6
      return `<div class="freq"><span><strong>${i + 1}</strong></span>
        <div class="bar"><i style="width:${w}%"></i><b style="left:${(1 / 6) / 0.3 * 100}%" title="1/6"></b></div>
        <span class="small">${n} · ${pct(f, 1)}</span></div>`;
    }).join('');
    const chi = E.chiSquareUniform(live.faces);
    // con menos de 30 datos el chi-cuadrado no es confiable, así que avisamos
    const verdict = total < 30 ? 'faltan datos' : (chi < E.CHI2_CRIT_5_DF ? 'compatible con uniforme' : 'por encima del crítico');
    $('liveKv').innerHTML = [
      tile('hash', 'Dados registrados', total),
      tile('sigma', 'Media (teórica 3,5)', total ? num(live.stats.mean, 3) : '–'),
      tile('scale', 'χ² (crítico 11,07)', total ? num(chi, 2) : '–', verdict),
      tile('target', 'Turnos con Yahtzee', `${live.yahtzeeTurns} / ${live.turns}`)
    ].join('');
  }

  // ======================================================== MONTECARLO
  // Guardamos la función que dibuja cada gráfico para poder volver a dibujarlo
  // cuando cambia el tamaño de la ventana o el tema (claro/oscuro).
  const redraws = {};
  function registerRedraw(id, fn) { redraws[id] = fn; fn(); }   // guarda la función y la ejecuta una vez
  function redrawAll() {
    Object.entries(redraws).forEach(([id, fn]) => {
      if (!$('panel-mc').hidden) fn();   // solo si la pestaña de Montecarlo está visible
    });
  }

  // Ejecuta la simulación en bloques ("chunks") y entre bloque y bloque le devuelve el control
  // al navegador con await. Así la página no se congela y la barra de progreso se actualiza.
  // step(desde, hasta) hace el trabajo de cada bloque.
  async function runChunked(total, chunk, step, progressEl) {
    for (let done = 0; done < total;) {
      const end = Math.min(total, done + chunk);
      step(done, end);
      done = end;
      progressEl.style.width = (done / total * 100) + '%';
      await delay(0);
    }
  }

  // Deshabilita el botón mientras se simula.
  function setBusy(btn, busy) { btn.disabled = busy; btn.textContent = busy ? 'Simulando…' : 'Ejecutar'; }
  // Muestra el resultado de un experimento: tarjetas con los números clave y debajo la explicación.
  // "tiles" es una lista de [icono, nombre, valor, nota].
  function showResult(id, html, tiles) {
    const el = $(id);
    el.hidden = false;
    el.innerHTML = (tiles ? `<div class="tiles">${tiles.map(t => tile(...t)).join('')}</div>` : '') + `<p class="txt">${html}</p>`;
  }
  // colores de las series de los gráficos (salen de las variables CSS)
  const c1 = () => Charts.css('--series-1');
  const c2 = () => Charts.css('--series-2');

  // ---------------------------------------------------- Experimento 1: dado
  // Lanza un dado N veces y mira cómo la media acumulada se acerca a 3,5 (Ley de los Grandes Números).
  async function runExp1() {
    const N = readInt('n1', 10, 5000000);
    const rng = E.makeRng($('seed1').value);     // con semilla si el usuario escribió una
    const cps = E.logCheckpoints(N, 12);         // valores de n donde vamos a guardar la media
    const xs = [], means = [], counts = [0, 0, 0, 0, 0, 0];
    const st = new E.RunningStats();
    let ptr = 0;                                 // apunta al siguiente punto de control
    setBusy($('run1'), true);
    await runChunked(N, 50000, (a, b) => {
      for (let i = a + 1; i <= b; i++) {
        const d = E.rollDie(rng);
        counts[d - 1]++; st.add(d);
        if (i === cps[ptr]) { xs.push(i); means.push(st.mean); ptr++; }
      }
    }, $('prog1'));
    setBusy($('run1'), false);

    // Banda teórica: 3,5 ± 1,96·σ/√n, con σ = √(35/12) (desviación estándar de un dado)
    const sigma = Math.sqrt(35 / 12);
    const lo = xs.map(n => 3.5 - 1.96 * sigma / Math.sqrt(n));
    const hi = xs.map(n => 3.5 + 1.96 * sigma / Math.sqrt(n));
    // contamos en cuántos puntos de control la media quedó dentro de la banda
    let inside = 0, tested = 0;
    xs.forEach((n, i) => { if (n >= 100) { tested++; if (means[i] >= lo[i] && means[i] <= hi[i]) inside++; } });
    const chi = E.chiSquareUniform(counts);

    // gráfico de la convergencia de la media y gráfico de barras con las frecuencias
    registerRedraw('c1a', () => Charts.lineChart($('c1a'), {
      xs, xlog: true, ymin: 2.5, ymax: 4.5, yDigits: 1, xLabel: 'Número de lanzamientos n (escala log)', yLabel: 'Media acumulada',
      series: [{ ys: means, color: c1(), label: 'Media' }], ref: { y: 3.5, label: 'E[X] = 3,5' }, band: { lo, hi, color: c1() },
      tipY: v => num(v, 4)
    }));
    registerRedraw('c1b', () => Charts.barChart($('c1b'), {
      labels: ['1', '2', '3', '4', '5', '6'], values: counts.map(c => c / N), color: c1(), yDigits: 3,
      ref: { y: 1 / 6, label: '1/6 = 0,1667' }, xLabel: 'Cara del dado', yLabel: 'Frecuencia relativa', ymax: 0.25,
      tipY: v => pct(v, 3), tipLabel: i => 'Cara ' + (i + 1)
    }));
    showResult('r1', `Tras <strong>${int(N)}</strong> lanzamientos: media = <strong>${num(st.mean, 4)}</strong> (|error| = ${num(Math.abs(st.mean - 3.5), 4)}; error típico teórico σ/√N = ${num(sigma / Math.sqrt(N), 4)}). ` +
      `Frecuencias entre ${pct(Math.min(...counts) / N, 2)} y ${pct(Math.max(...counts) / N, 2)} (teórica 16,67 %). ` +
      `χ² = ${num(chi, 2)} (${chi < E.CHI2_CRIT_5_DF ? 'no se rechaza' : 'se rechaza'} la uniformidad con α = 0,05; crítico 11,07). ` +
      `Estadístico z = (X̄ − 3,5)/(σ/√N) = ${num((st.mean - 3.5) / (sigma / Math.sqrt(N)), 2)} (|z| < 1,96 ⇒ dentro de la banda al 95 %). ` +
      `La media acumulada estuvo dentro de la banda en ${inside} de ${tested} puntos de control con n ≥ 100 (no son independientes: una misma corrida puede pasar varios puntos seguidos cerca del borde; promediando sobre muchas corridas la cobertura es 95 %). ` +
      `<strong>La banda se estrecha como 1/√n: eso es la Ley de los Grandes Números en acción.</strong>`, [
        ['sigma', 'Media muestral', num(st.mean, 4), 'teórica 3,5'],
        ['ruler', '|Error| de la media', num(Math.abs(st.mean - 3.5), 4), `error típico σ/√N = ${num(sigma / Math.sqrt(N), 4)}`],
        ['scale', 'χ² de uniformidad', num(chi, 2), chi < E.CHI2_CRIT_5_DF ? 'no se rechaza (crítico 11,07)' : 'se rechaza (crítico 11,07)'],
        ['percent', 'Estadístico z', num((st.mean - 3.5) / (sigma / Math.sqrt(N)), 2), '|z| < 1,96 ⇒ dentro del 95 %']
      ]);
  }

  // ------------------------------------------ Experimento 2: 5 dados, 1 tirada
  // Aquí guardamos los datos de la última corrida para poder redibujar el gráfico
  // cuando el usuario cambia la combinación en la lista desplegable.
  const exp2 = { data: null };
  function drawExp2() {
    if (!exp2.data) return;
    const d = exp2.data, id = $('sel2').value, ev = d.series[id];
    const p = d.exact[id].p;   // probabilidad teórica exacta de la combinación elegida
    Charts.lineChart($('c2'), {
      xs: d.xs, xlog: true, ymin: 0, ymax: Math.min(1, Math.max(p * 2.2, 0.01)), yDigits: 3,
      xLabel: 'Número de tiradas n (escala log)', yLabel: 'Frecuencia relativa acumulada',
      series: [{ ys: ev, color: c1(), label: 'Frecuencia' }], ref: { y: p, label: 'teórica ' + pct(p, 3) }, tipY: v => pct(v, 3),
      band: { lo: d.xs.map(n => p - 1.96 * Math.sqrt(p * (1 - p) / n)), hi: d.xs.map(n => p + 1.96 * Math.sqrt(p * (1 - p) / n)), color: c1() }
    });
  }
  // llenamos la lista desplegable con las combinaciones del motor (Yahtzee por defecto)
  $('sel2').innerHTML = E.SINGLE_ROLL_EVENTS.map(e => `<option value="${e.id}">${e.label}</option>`).join('');
  $('sel2').value = 'yahtzee';
  $('sel2').addEventListener('change', drawExp2);

  // Tira 5 dados N veces y compara la frecuencia de cada combinación con su probabilidad exacta.
  async function runExp2() {
    const N = readInt('n2', 100, 5000000);
    const rng = E.makeRng($('seed2').value);
    const exact = E.exactSingleRollProbabilities();   // valores teóricos (enumeración)
    const cps = E.logCheckpoints(N, 12);
    const hits = {}, series = {};                     // hits = veces que ocurrió cada combinación
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
        // en los puntos de control guardamos la frecuencia acumulada de cada combinación
        if (i === cps[ptr]) { xs.push(i); for (const e of E.SINGLE_ROLL_EVENTS) series[e.id].push(hits[e.id] / i); ptr++; }
      }
    }, $('prog2'));
    setBusy($('run2'), false);

    // Tabla: teórica vs simulada, error y si cae dentro del intervalo de confianza del 95 %
    let okCount = 0, maxErr = 0;
    const rows = E.SINGLE_ROLL_EVENTS.map(e => {
      const p = exact[e.id].p, ph = hits[e.id] / N;
      const half = 1.96 * Math.sqrt(p * (1 - p) / N);   // semiancho del IC usando la probabilidad teórica
      const ok = Math.abs(ph - p) <= half; if (ok) okCount++;
      maxErr = Math.max(maxErr, Math.abs(ph - p));
      return `<tr><td>${e.label}</td><td>${pct(p, 3)} <span class="muted small">(${exact[e.id].favorable}/${exact[e.id].total})</span></td><td>${pct(ph, 3)}</td><td>${pct(Math.abs(ph - p), 3)}</td><td>${pct(half, 3)}</td><td>${ok ? '✔ sí' : '✘ no'}</td></tr>`;
    });
    $('t2').querySelector('tbody').innerHTML = rows.join('');
    exp2.data = { xs, series, exact };
    registerRedraw('c2', drawExp2);
    showResult('r2', `Con <strong>${int(N)}</strong> tiradas, ${okCount} de ${E.SINGLE_ROLL_EVENTS.length} frecuencias quedaron dentro del IC 95 % construido con la probabilidad teórica (con 6 eventos se espera, en promedio, que 0,3 queden fuera solo por azar). El error absoluto es mayor para eventos frecuentes y relativamente mayor para los raros; en ambos casos decrece como 1/√N.`, [
      ['check', 'Dentro del IC 95 %', `${okCount} de ${E.SINGLE_ROLL_EVENTS.length}`, 'combinaciones'],
      ['hash', 'Tiradas simuladas', int(N), 'de 5 dados cada una'],
      ['ruler', 'Mayor error absoluto', pct(maxErr, 3), 'entre las combinaciones']
    ]);
  }

  // -------------------------------------------- Experimento 3: Yahtzee en un turno
  // Simula UN turno completo (3 lanzamientos) reteniendo siempre la cara más repetida.
  // Devuelve true si al final salió Yahtzee. Está escrita a mano (sin usar el motor)
  // para que sea rápida, porque se va a llamar cientos de miles de veces.
  function yahtzeeTurn(rng) {
    const dice = [0, 0, 0, 0, 0];
    for (let i = 0; i < 5; i++) dice[i] = Math.floor(rng() * 6) + 1;   // primer lanzamiento
    for (let r = 1; r < 3; r++) {                                       // lanzamientos 2 y 3
      const c = [0, 0, 0, 0, 0, 0];
      for (let i = 0; i < 5; i++) c[dice[i] - 1]++;
      let face = 0;                                                     // cara más repetida
      for (let k = 1; k < 6; k++) if (c[k] > c[face]) face = k;
      if (c[face] === 5) return true;                                   // ya hay Yahtzee
      for (let i = 0; i < 5; i++) if (dice[i] !== face + 1) dice[i] = Math.floor(rng() * 6) + 1;
    }
    return dice.every(d => d === dice[0]);
  }

  // Repite el turno N veces y compara la frecuencia de Yahtzee con la probabilidad exacta.
  async function runExp3() {
    const N = readInt('n3', 100, 3000000);
    const rng = E.makeRng($('seed3').value);
    const exact = E.exactYahtzeeInTurn(3);   // probabilidad exacta (programación dinámica)
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

    const band = n => 1.96 * Math.sqrt(exact * (1 - exact) / n);   // semiancho del IC para n turnos
    registerRedraw('c3', () => Charts.lineChart($('c3'), {
      xs, xlog: true, ymin: 0, ymax: 0.12, yDigits: 2, xLabel: 'Número de turnos n (escala log)', yLabel: 'Frecuencia relativa de Yahtzee',
      series: [{ ys: fs, color: c1(), label: 'Frecuencia' }], ref: { y: exact, label: 'exacta ' + pct(exact, 3) }, tipY: v => pct(v, 3),
      band: { lo: xs.map(n => exact - band(n)), hi: xs.map(n => exact + band(n)), color: c1() }
    }));
    const ph = hits / N;
    showResult('r3', `<strong>${int(hits)}</strong> Yahtzees en <strong>${int(N)}</strong> turnos → frecuencia <strong>${pct(ph, 3)}</strong> frente a la probabilidad exacta <strong>${pct(exact, 3)}</strong> ` +
      `(error ${pct(Math.abs(ph - exact), 3)}; IC 95 % teórico ±${pct(band(N), 3)}). Como el evento es raro, con N pequeño la frecuencia oscila mucho: la convergencia es lenta pero segura.`, [
      ['target', 'Frecuencia simulada', pct(ph, 3), `${int(hits)} Yahtzees en ${int(N)} turnos`],
      ['star', 'Probabilidad exacta', pct(exact, 3), 'programación dinámica'],
      ['ruler', 'Error absoluto', pct(Math.abs(ph - exact), 3), `IC 95 % teórico ±${pct(band(N), 3)}`]
    ]);
  }

  // -------------------------------------------------- Experimento 4: partidas
  // Simula M partidas completas entre dos computadoras y analiza los puntajes.
  async function runExp4() {
    const M = readInt('n4', 10, 200000);
    const rng = E.makeRng($('seed4').value);
    const strats = [E.computerStrategy, E.computerStrategy];   // las dos juegan igual
    const st = [new E.RunningStats(), new E.RunningStats()];   // estadísticas del puntaje de cada jugador
    const cps = E.logCheckpoints(M, 12);
    const xs = [], m1 = [], m2 = [];                           // medias acumuladas de J1 y J2
    const wins = [0, 0], ties = { n: 0 }, yz = [0, 0];
    const BIN = 20;                                            // ancho de cada barra del histograma
    const hist = new Map();                                    // intervalo -> cuántas partidas cayeron ahí
    let ptr = 0;
    setBusy($('run4'), true);
    await runChunked(M, 200, (a, b) => {
      for (let g = a + 1; g <= b; g++) {
        const r = E.playGame(strats, rng);
        r.scores.forEach((s, p) => { st[p].add(s); yz[p] += r.yahtzeeTurns[p]; });
        // quién ganó la partida (o empate)
        if (r.scores[0] > r.scores[1]) wins[0]++; else if (r.scores[1] > r.scores[0]) wins[1]++; else ties.n++;
        // histograma del puntaje del jugador 1
        const bin = Math.floor(r.scores[0] / BIN) * BIN;
        hist.set(bin, (hist.get(bin) || 0) + 1);
        if (g === cps[ptr]) { xs.push(g); m1.push(st[0].mean); m2.push(st[1].mean); ptr++; }
      }
    }, $('prog4'));
    setBusy($('run4'), false);

    // tabla resumen de cada jugador
    $('t4').querySelector('tbody').innerHTML = [0, 1].map(p =>
      `<tr><td>Jugador ${p + 1} (${strats[p].label})</td><td>${num(st[p].mean, 2)}</td><td>${num(st[p].std, 2)}</td><td>${num(st[p].ci95, 2)}</td><td>${st[p].min} – ${st[p].max}</td><td>${int(wins[p])} (${pct(wins[p] / M, 1)})</td><td>${num(yz[p] / M, 3)}</td></tr>`).join('');

    // histograma: recorremos todos los intervalos (incluso los vacíos) de menor a mayor
    const keys = Array.from(hist.keys());
    const lo = Math.min(...keys), hi = Math.max(...keys);
    const labels = [], vals = [];
    for (let k = lo; k <= hi; k += BIN) { labels.push(String(k)); vals.push((hist.get(k) || 0) / M); }
    registerRedraw('c4a', () => Charts.barChart($('c4a'), { labels, values: vals, color: c1(), yDigits: 3, xLabel: `Puntaje total (intervalos de ${BIN})`, yLabel: 'Frecuencia relativa',
      tipY: v => pct(v, 2), tipLabel: i => `Puntaje ${labels[i]} a ${+labels[i] + BIN - 1}` }));

    // Gráfico de convergencia. Para el eje y ignoramos los primeros puntos (n muy chico)
    // porque las medias varían demasiado y aplastarían el resto de la gráfica.
    const sd = st[0].std, mu = st[0].mean;
    const tail = xs.map((n, i) => ({ n, i })).filter(o => o.n >= Math.min(20, M / 2));
    const all = tail.flatMap(o => [m1[o.i], m2[o.i]]);
    const pad = (Math.max(...all) - Math.min(...all)) * 0.15 || 1;
    registerRedraw('c4b', () => Charts.lineChart($('c4b'), {
      xs, xlog: true, ymin: Math.min(...all) - pad, ymax: Math.max(...all) + pad, yDigits: 0,
      xLabel: 'Número de partidas n (escala log)', yLabel: 'Puntaje medio acumulado',
      series: [{ ys: m1, color: c1(), label: 'J1' }, { ys: m2, color: c2(), label: 'J2' }], tipY: v => num(v, 1),
      band: { lo: xs.map(n => mu - 1.96 * sd / Math.sqrt(n)), hi: xs.map(n => mu + 1.96 * sd / Math.sqrt(n)), color: c1() }
    }));

    // Comparamos las medias de J1 y J2: si la diferencia cabe dentro de su IC al 95 %,
    // no hay evidencia de que alguno tenga ventaja.
    const diff = st[0].mean - st[1].mean;
    const seDiff = Math.sqrt(st[0].sem ** 2 + st[1].sem ** 2);   // error estándar de la diferencia
    showResult('r4', `En <strong>${int(M)}</strong> partidas: Jugador 1 gana ${pct(wins[0] / M, 1)}, Jugador 2 ${pct(wins[1] / M, 1)} y hay ${pct(ties.n / M, 1)} de empates. ` +
      `Diferencia de medias J1 − J2 = <strong>${num(diff, 2)}</strong> ± ${num(1.96 * seDiff, 2)} (IC 95 %). ` +
      (Math.abs(diff) <= 1.96 * seDiff
        ? 'Como ambas computadoras deciden igual, la diferencia no es estadísticamente distinta de 0: empezar primero no da ventaja y la simulación lo confirma.'
        : 'La diferencia queda fuera del IC (ocurre ≈ 5 % de las veces por azar): repite con otra semilla o más partidas.'), [
      ['trophy', 'Victorias del Jugador 1', pct(wins[0] / M, 1), `${int(wins[0])} partidas`],
      ['trophy', 'Victorias del Jugador 2', pct(wins[1] / M, 1), `${int(wins[1])} partidas`],
      ['scale', 'Empates', pct(ties.n / M, 1), `${int(ties.n)} partidas`],
      ['sigma', 'Diferencia de medias J1 − J2', num(diff, 2), `± ${num(1.96 * seDiff, 2)} (IC 95 %)`]
    ]);
  }

  // ================================================================ EVENTOS
  // Aquí conectamos cada botón / elemento de la página con su función.
  $('newGame').addEventListener('click', newGame);
  $('modalNew').addEventListener('click', newGame);
  $('modalClose').addEventListener('click', () => { $('modalBg').hidden = true; });
  $('rollBtn').addEventListener('click', () => { if (isHumanTurn()) roll(); });
  // Los dados y las casillas se redibujan cada vez, así que en vez de ponerle un evento a cada
  // uno usamos "delegación": un solo evento en el contenedor y vemos en cuál se hizo clic.
  $('diceRow').addEventListener('click', e => { const b = e.target.closest('.die'); if (b) toggleKeep(Number(b.dataset.i)); });
  $('scoreTable').addEventListener('click', e => { const td = e.target.closest('td.pick'); if (td && isHumanTurn()) pick(td.dataset.cat); });
  // lo mismo con el teclado (Enter o espacio) para que se pueda usar sin mouse
  $('scoreTable').addEventListener('keydown', e => {
    const td = e.target.closest('td.pick');
    if (td && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); if (isHumanTurn()) pick(td.dataset.cat); }
  });
  // al cambiar el tipo de jugador (humano / computadora) se reinicia la partida
  $('p1type').addEventListener('change', newGame);
  $('p2type').addEventListener('change', newGame);

  $('run1').addEventListener('click', runExp1);
  $('run2').addEventListener('click', runExp2);
  $('run3').addEventListener('click', runExp3);
  $('run4').addEventListener('click', runExp4);

  // Pestañas: mostramos solo el panel de la pestaña elegida y ocultamos las demás.
  const tabs = ['play', 'mc', 'method'];
  tabs.forEach(t => $('tab-' + t).addEventListener('click', () => {
    tabs.forEach(o => {
      $('tab-' + o).setAttribute('aria-selected', String(o === t));
      $('panel-' + o).hidden = o !== t;
    });
    // los gráficos no se pueden dibujar bien mientras la pestaña está oculta (tamaño 0),
    // por eso los redibujamos al mostrarla
    Charts.hideTip();   // por si quedó un tooltip abierto al cambiar de pestaña
    if (t === 'mc') requestAnimationFrame(redrawAll);
  }));

  // Botones de la portada: cambian de pestaña y bajan hasta ella
  $('heroPlay').addEventListener('click', () => { $('tab-play').click(); $('tab-play').scrollIntoView({ behavior: 'smooth' }); });
  $('heroSim').addEventListener('click', () => { $('tab-mc').click(); $('tab-mc').scrollIntoView({ behavior: 'smooth' }); });

  window.addEventListener('resize', redrawAll);
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redrawAll);

  // Dados decorativos de la portada (usan el mismo dibujo que los del juego)
  $('heroDice').innerHTML = [['a', 5], ['b', 3], ['c', 6]]
    .map(([k, v]) => `<div class="fdie ${k}">${dieHTML(v, '', 'tabindex="-1" disabled')}</div>`).join('');

  Icons.hydrate();   // reemplaza los <span data-icon="..."> por sus SVG
  newGame();         // arranca la primera partida al cargar la página
})();
