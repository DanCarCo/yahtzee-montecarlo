/*
 * charts.js - Gráficos hechos a mano sobre <canvas>.
 *
 * No usamos librerías externas (Chart.js, etc.) para que la página funcione sin internet
 * y para entender cómo se dibuja un gráfico: pasar de los datos a coordenadas en píxeles.
 * Los colores se leen de las variables CSS para que funcione en modo claro y oscuro.
 */
(function (root) {
  'use strict';

  // Lee el valor de una variable CSS (por ejemplo '--series-1') del <html>.
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  // Prepara el canvas antes de dibujar: ajusta la resolución a la pantalla y lo limpia.
  function setup(canvas) {
    // En pantallas de alta densidad (retina) 1 píxel CSS son varios píxeles reales;
    // si no multiplicamos por dpr el gráfico se vería borroso.
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);   // así podemos dibujar con coordenadas "normales"
    ctx.clearRect(0, 0, w, h);
    ctx.font = '12px system-ui, -apple-system, "Segoe UI", sans-serif';
    return { ctx, w, h };
  }

  // Calcula marcas "bonitas" para un eje (como 0, 0.5, 1, 1.5 en vez de 0.37, 0.74...).
  // Toma el paso aproximado (span/count) y lo redondea a 1, 2, 5 o 10 por una potencia de 10.
  function niceTicks(min, max, count) {
    const span = max - min || 1;
    const raw = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));   // potencia de 10 del paso
    const norm = raw / mag;
    const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
    const ticks = [];
    // el 1e-9 evita que un error de redondeo deje fuera la última marca
    for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(+v.toPrecision(12));
    return ticks;
  }

  // Da formato al texto de una marca del eje (con decimales fijos o automático).
  function fmt(v, digits) {
    if (digits !== undefined) return v.toFixed(digits);
    if (Math.abs(v) >= 1000) return v.toLocaleString('es');
    return String(+v.toPrecision(4));
  }

  /*
   * Gráfico de líneas.
   * opts: {
   *   xs: number[], series: [{ys, color, label, dash?}],
   *   xlog: bool, ymin, ymax, xLabel, yLabel, yDigits,
   *   ref: {y, label}            -> línea de referencia (valor teórico)
   *   band: {lo: number[], hi: number[], color} -> banda (misma x que xs)
   * }
   */
  function lineChart(canvas, opts) {
    const { ctx, w, h } = setup(canvas);
    // m = márgenes alrededor del área de dibujo (izquierda, derecha, arriba, abajo)
    const m = { l: 56, r: 30, t: 14, b: 38 };
    const pw = w - m.l - m.r, ph = h - m.t - m.b;   // ancho y alto del área donde van los datos
    const xs = opts.xs;
    // Si el eje x es logarítmico trabajamos con log10 de los valores.
    const xmin = opts.xlog ? Math.log10(xs[0]) : xs[0];
    const xmax = opts.xlog ? Math.log10(xs[xs.length - 1]) : xs[xs.length - 1];
    // X(x): convierte un valor de datos en la coordenada horizontal en píxeles.
    const X = x => m.l + ((opts.xlog ? Math.log10(x) : x) - xmin) / ((xmax - xmin) || 1) * pw;

    // Límites del eje y: si no nos los dan, los calculamos con los datos más un margen del 10 %.
    let ymin = opts.ymin, ymax = opts.ymax;
    if (ymin === undefined || ymax === undefined) {
      let lo = Infinity, hi = -Infinity;
      opts.series.forEach(s => s.ys.forEach(y => { if (y < lo) lo = y; if (y > hi) hi = y; }));
      if (opts.ref) { lo = Math.min(lo, opts.ref.y); hi = Math.max(hi, opts.ref.y); }
      const pad = (hi - lo) * 0.1 || 1;
      if (ymin === undefined) ymin = lo - pad;
      if (ymax === undefined) ymax = hi + pad;
    }
    // Y(y): igual pero vertical. Ojo: en el canvas el eje y crece hacia ABAJO, por eso el "1 -".
    const Y = y => m.t + (1 - (y - ymin) / ((ymax - ymin) || 1)) * ph;

    const grid = css('--grid'), muted = css('--text-muted'), secondary = css('--text-secondary');

    // Rejilla horizontal y números del eje y
    ctx.strokeStyle = grid; ctx.lineWidth = 1; ctx.fillStyle = muted;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    niceTicks(ymin, ymax, 5).forEach(t => {
      const y = Math.round(Y(t)) + 0.5;   // el +0.5 hace que la línea de 1px quede nítida
      ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(m.l + pw, y); ctx.stroke();
      ctx.fillText(fmt(t, opts.yDigits), m.l - 8, y);
    });
    // Marcas del eje x: en escala log van en potencias de 10 (1, 10, 100, ...)
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    let xticks;
    if (opts.xlog) {
      xticks = [];
      for (let e = Math.ceil(xmin); e <= xmax + 1e-9; e++) xticks.push(Math.pow(10, e));
    } else xticks = niceTicks(xmin, xmax, 6);
    xticks.forEach(t => {
      const x = Math.round(X(t)) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, m.t + ph); ctx.lineTo(x, m.t + ph + 4); ctx.stroke();
      ctx.fillText(fmt(t), x, m.t + ph + 7);
    });
    // línea del eje x
    ctx.strokeStyle = muted;
    ctx.beginPath(); ctx.moveTo(m.l, m.t + ph + 0.5); ctx.lineTo(m.l + pw, m.t + ph + 0.5); ctx.stroke();

    // Todo lo que sigue se recorta al área del gráfico, para que si una línea se sale
    // del rango del eje y (por ejemplo al inicio, con n muy chico) no se dibuje afuera.
    ctx.save();
    ctx.beginPath(); ctx.rect(m.l, m.t, pw, ph); ctx.clip();

    // Banda de confianza: un polígono que va por el borde superior de izquierda a derecha
    // y regresa por el borde inferior, relleno con transparencia.
    if (opts.band) {
      ctx.fillStyle = opts.band.color; ctx.globalAlpha = 0.18;
      ctx.beginPath();
      xs.forEach((x, i) => { const px = X(x), py = Y(opts.band.hi[i]); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
      for (let i = xs.length - 1; i >= 0; i--) ctx.lineTo(X(xs[i]), Y(opts.band.lo[i]));
      ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    }

    // Línea de referencia (valor teórico) punteada
    if (opts.ref) {
      ctx.strokeStyle = secondary; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
      const y = Y(opts.ref.y);
      ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(m.l + pw, y); ctx.stroke(); ctx.setLineDash([]);
    }

    // Series de datos: unimos los puntos con líneas (el primero con moveTo, el resto con lineTo)
    opts.series.forEach(s => {
      ctx.strokeStyle = s.color; ctx.lineWidth = 2; ctx.lineJoin = 'round';
      ctx.setLineDash(s.dash || []);
      ctx.beginPath();
      xs.forEach((x, i) => { const px = X(x), py = Y(s.ys[i]); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
      ctx.stroke(); ctx.setLineDash([]);
    });
    ctx.restore();   // quitamos el recorte

    // Texto de la línea de referencia (va fuera del recorte para que no se corte)
    if (opts.ref) {
      ctx.fillStyle = secondary; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      ctx.fillText(opts.ref.label, m.l + pw - 4, Y(opts.ref.y) - 4);
    }
    // Títulos de los ejes (el del eje y se escribe girado 90 grados)
    ctx.fillStyle = secondary; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    if (opts.xLabel) ctx.fillText(opts.xLabel, m.l + pw / 2, h - 2);
    if (opts.yLabel) {
      ctx.save(); ctx.translate(12, m.t + ph / 2); ctx.rotate(-Math.PI / 2);
      ctx.textBaseline = 'top'; ctx.fillText(opts.yLabel, 0, -6); ctx.restore();
    }
  }

  /*
   * Gráfico de barras verticales.
   * opts: { labels[], values[], color, yDigits, ref: {y,label}, yLabel, xLabel, ymax }
   */
  function barChart(canvas, opts) {
    const { ctx, w, h } = setup(canvas);
    const m = { l: 56, r: 30, t: 14, b: 38 };
    const pw = w - m.l - m.r, ph = h - m.t - m.b;
    const n = opts.values.length;
    // Altura máxima del eje: la que nos dan, o el mayor valor (o la referencia) más 12 % de margen.
    let ymax = opts.ymax !== undefined ? opts.ymax : Math.max(...opts.values, opts.ref ? opts.ref.y : 0) * 1.12;
    if (!(ymax > 0)) ymax = 1;   // por si todos los valores son 0
    const Y = y => m.t + (1 - y / ymax) * ph;   // en barras el eje y siempre empieza en 0
    const grid = css('--grid'), muted = css('--text-muted'), secondary = css('--text-secondary');

    // Rejilla horizontal y números del eje y
    ctx.strokeStyle = grid; ctx.lineWidth = 1; ctx.fillStyle = muted;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    niceTicks(0, ymax, 5).forEach(t => {
      const y = Math.round(Y(t)) + 0.5;
      ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(m.l + pw, y); ctx.stroke();
      ctx.fillText(fmt(t, opts.yDigits), m.l - 8, y);
    });

    // "slot" = espacio horizontal de cada barra; "bw" = ancho de la barra (70 % del espacio, máx. 48px)
    const slot = pw / n, bw = Math.max(2, Math.min(48, slot - 2 > 6 ? slot * 0.7 : slot - 2));
    ctx.fillStyle = opts.color;
    opts.values.forEach((v, i) => {
      const x = m.l + slot * i + (slot - bw) / 2, y = Y(v), bh = m.t + ph - y;
      const r = Math.min(4, bw / 2, bh);   // radio de las esquinas redondeadas de arriba
      ctx.beginPath();
      ctx.moveTo(x, m.t + ph); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.lineTo(x + bw - r, y); ctx.quadraticCurveTo(x + bw, y, x + bw, y + r); ctx.lineTo(x + bw, m.t + ph);
      ctx.closePath(); ctx.fill();
    });

    // Etiquetas del eje x. Si hay muchas barras ponemos solo una de cada "every" para que no se encimen.
    ctx.fillStyle = muted; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const every = Math.ceil(n / Math.max(1, Math.floor(pw / 48)));
    opts.labels.forEach((l, i) => { if (i % every === 0) ctx.fillText(l, m.l + slot * (i + 0.5), m.t + ph + 7); });
    ctx.strokeStyle = muted;
    ctx.beginPath(); ctx.moveTo(m.l, m.t + ph + 0.5); ctx.lineTo(m.l + pw, m.t + ph + 0.5); ctx.stroke();

    // Línea de referencia punteada (por ejemplo 1/6) con su texto
    if (opts.ref) {
      ctx.strokeStyle = secondary; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
      const y = Y(opts.ref.y);
      ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(m.l + pw, y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = secondary; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      ctx.fillText(opts.ref.label, m.l + pw - 4, y - 4);
    }
    // Títulos de los ejes
    ctx.fillStyle = secondary; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    if (opts.xLabel) ctx.fillText(opts.xLabel, m.l + pw / 2, h - 2);
    if (opts.yLabel) {
      ctx.save(); ctx.translate(12, m.t + ph / 2); ctx.rotate(-Math.PI / 2);
      ctx.textBaseline = 'top'; ctx.fillText(opts.yLabel, 0, -6); ctx.restore();
    }
  }

  // Lo que dejamos disponible para app.js
  root.Charts = { lineChart, barChart, css };
})(window);
