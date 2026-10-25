/*
 * charts.js - Gráficos hechos a mano sobre <canvas>.
 *
 * No usamos librerías externas (Chart.js, etc.) para que la página funcione sin internet
 * y para entender cómo se dibuja un gráfico: pasar de los datos a coordenadas en píxeles.
 * Los colores se leen de las variables CSS para que funcione en modo claro y oscuro.
 *
 * Además de dibujar, cada gráfico tiene "hover": al pasar el mouse aparece una línea
 * guía (en los de líneas) o se resalta la barra (en los de barras) y sale un tooltip
 * con el valor exacto.
 */
(function (root) {
  'use strict';

  // Lee el valor de una variable CSS (por ejemplo '--series-1') del <html>.
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  // Convierte un color '#rrggbb' en 'rgba(r,g,b,alpha)' (para rellenos con transparencia).
  function withAlpha(hex, a) {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  // ------------------------------------------------------------------ Tooltip
  // Un solo <div> compartido por todos los gráficos; se crea la primera vez que se necesita.
  let tipEl = null;
  function tipShow(html, cx, cy) {
    if (!tipEl) {
      tipEl = document.createElement('div');
      tipEl.className = 'chart-tip';
      document.body.appendChild(tipEl);
    }
    tipEl.innerHTML = html;
    tipEl.style.display = 'block';
    // lo colocamos junto al cursor, pero cuidando que no se salga de la ventana
    const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    let x = cx + 14, y = cy - h - 10;
    if (x + w > window.innerWidth - 8) x = cx - w - 14;
    if (y < 8) y = cy + 14;
    tipEl.style.left = x + 'px';
    tipEl.style.top = y + 'px';
  }
  function tipHide() { if (tipEl) tipEl.style.display = 'none'; }

  // Los eventos del mouse se registran UNA sola vez por canvas. Cada vez que se redibuja el
  // gráfico solo se actualiza canvas._chart (el estado más reciente), así que no se duplican.
  function bindHover(canvas) {
    if (canvas._bound) return;
    canvas._bound = true;
    canvas.addEventListener('mousemove', e => {
      const s = canvas._chart;
      if (!s || !s.plot) return;
      const r = canvas.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const p = s.plot;
      // fuera del área de datos: sin hover
      if (mx < p.l || mx > p.l + p.pw || my < p.t || my > p.t + p.ph) { s.draw(-1); tipHide(); return; }
      let idx;
      if (s.kind === 'line') {
        // punto más cercano horizontalmente al mouse
        let bd = Infinity; idx = 0;
        s.px.forEach((x, i) => { const d = Math.abs(x - mx); if (d < bd) { bd = d; idx = i; } });
      } else {
        idx = Math.floor((mx - p.l) / s.slot);
        if (idx < 0 || idx >= s.n) { s.draw(-1); tipHide(); return; }
      }
      s.draw(idx);
      tipShow(s.tip(idx), e.clientX, e.clientY);
    });
    canvas.addEventListener('mouseleave', () => {
      const s = canvas._chart;
      if (s) s.draw(-1);
      tipHide();
    });
  }

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
    ctx.font = '12px Inter, system-ui, -apple-system, "Segoe UI", sans-serif';
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

  // Formato por defecto de los valores que salen en el tooltip y en la etiqueta final.
  const defTip = v => String(+v.toPrecision(5)).replace('.', ',');

  /*
   * Gráfico de líneas.
   * opts: {
   *   xs: number[], series: [{ys, color, label, dash?}],
   *   xlog: bool, ymin, ymax, xLabel, yLabel, yDigits,
   *   ref: {y, label}            -> línea de referencia (valor teórico)
   *   band: {lo: number[], hi: number[], color} -> banda (misma x que xs)
   *   tipY: function(valor) -> texto  (formato de los valores en tooltip y etiqueta final)
   * }
   */
  function lineChart(canvas, opts) {
    const st = canvas._chart || (canvas._chart = {});
    st.kind = 'line';
    st.opts = opts;
    st.draw = hi => drawLine(canvas, st, hi);   // hi = índice del punto bajo el mouse (-1 = ninguno)
    st.draw(-1);
    bindHover(canvas);
  }

  function drawLine(canvas, st, hi) {
    const opts = st.opts;
    const { ctx, w, h } = setup(canvas);
    // m = márgenes alrededor del área de dibujo (izquierda, derecha, arriba, abajo)
    const m = { l: 56, r: 30, t: 14, b: 38 };
    const pw = w - m.l - m.r, ph = h - m.t - m.b;   // ancho y alto del área donde van los datos
    const xs = opts.xs;
    const tipY = opts.tipY || defTip;
    // Si el eje x es logarítmico trabajamos con log10 de los valores.
    const xmin = opts.xlog ? Math.log10(xs[0]) : xs[0];
    const xmax = opts.xlog ? Math.log10(xs[xs.length - 1]) : xs[xs.length - 1];
    // X(x): convierte un valor de datos en la coordenada horizontal en píxeles.
    const X = x => m.l + ((opts.xlog ? Math.log10(x) : x) - xmin) / ((xmax - xmin) || 1) * pw;

    // Límites del eje y: si no nos los dan, los calculamos con los datos más un margen del 10 %.
    let ymin = opts.ymin, ymax = opts.ymax;
    if (ymin === undefined || ymax === undefined) {
      let lo = Infinity, hiV = -Infinity;
      opts.series.forEach(s => s.ys.forEach(y => { if (y < lo) lo = y; if (y > hiV) hiV = y; }));
      if (opts.ref) { lo = Math.min(lo, opts.ref.y); hiV = Math.max(hiV, opts.ref.y); }
      const pad = (hiV - lo) * 0.1 || 1;
      if (ymin === undefined) ymin = lo - pad;
      if (ymax === undefined) ymax = hiV + pad;
    }
    // Y(y): igual pero vertical. Ojo: en el canvas el eje y crece hacia ABAJO, por eso el "1 -".
    const Y = y => m.t + (1 - (y - ymin) / ((ymax - ymin) || 1)) * ph;

    const grid = css('--grid'), muted = css('--text-muted'), secondary = css('--text-secondary');
    const ink = css('--text-primary'), surface = css('--surface-1');

    // Guardamos la geometría para que el hover sepa dónde está cada punto
    st.plot = { l: m.l, t: m.t, pw, ph };
    st.px = xs.map(X);

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
    // y regresa por el borde inferior. El relleno es un degradado vertical con transparencia.
    if (opts.band) {
      const g = ctx.createLinearGradient(0, m.t, 0, m.t + ph);
      g.addColorStop(0, withAlpha(opts.band.color, 0.28));
      g.addColorStop(1, withAlpha(opts.band.color, 0.08));
      ctx.fillStyle = g;
      ctx.beginPath();
      xs.forEach((x, i) => { const px = X(x), py = Y(opts.band.hi[i]); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
      for (let i = xs.length - 1; i >= 0; i--) ctx.lineTo(X(xs[i]), Y(opts.band.lo[i]));
      ctx.closePath(); ctx.fill();
    }

    // Línea de referencia (valor teórico) punteada
    if (opts.ref) {
      ctx.strokeStyle = secondary; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
      const y = Y(opts.ref.y);
      ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(m.l + pw, y); ctx.stroke(); ctx.setLineDash([]);
    }

    // Series de datos: unimos los puntos con líneas (el primero con moveTo, el resto con lineTo)
    opts.series.forEach(s => {
      ctx.strokeStyle = s.color; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.setLineDash(s.dash || []);
      ctx.beginPath();
      xs.forEach((x, i) => { const px = X(x), py = Y(s.ys[i]); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
      ctx.stroke(); ctx.setLineDash([]);
    });

    // Hover: línea vertical guía y un punto sobre cada serie en el índice señalado
    if (hi >= 0) {
      ctx.strokeStyle = muted; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(st.px[hi] + 0.5, m.t); ctx.lineTo(st.px[hi] + 0.5, m.t + ph); ctx.stroke();
      ctx.setLineDash([]);
      opts.series.forEach(s => {
        ctx.fillStyle = s.color; ctx.strokeStyle = surface; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(st.px[hi], Y(s.ys[hi]), 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      });
    }
    ctx.restore();   // quitamos el recorte

    // Marcador y etiqueta directa en el último punto de cada serie (con su valor final).
    // Si hay dos series, la 1.ª va arriba del punto y la 2.ª abajo, para que no se encimen.
    const last = xs.length - 1;
    opts.series.forEach((s, i) => {
      const px = X(xs[last]), py = Y(s.ys[last]);
      ctx.fillStyle = s.color; ctx.strokeStyle = surface; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, py, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = ink; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
      ctx.font = '600 12px Inter, system-ui, sans-serif';
      ctx.fillText((s.label ? s.label + ' · ' : '') + tipY(s.ys[last]), px - 8, py + (i % 2 === 0 ? -10 : 18));
      ctx.font = '12px Inter, system-ui, sans-serif';
    });

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

    // Texto del tooltip para el punto i (HTML sencillo)
    st.tip = i => {
      let html = `<b>n = ${xs[i].toLocaleString('es')}</b>`;
      opts.series.forEach(s => {
        html += `<div><i style="background:${s.color}"></i>${s.label ? s.label + ': ' : ''}${tipY(s.ys[i])}</div>`;
      });
      if (opts.ref) html += `<div class="tip-muted">${opts.ref.label}</div>`;
      if (opts.band) html += `<div class="tip-muted">Banda 95 %: ${tipY(opts.band.lo[i])} a ${tipY(opts.band.hi[i])}</div>`;
      return html;
    };
  }

  /*
   * Gráfico de barras verticales.
   * opts: { labels[], values[], color, yDigits, ref: {y,label}, yLabel, xLabel, ymax,
   *         tipY: function(valor) -> texto, tipLabel: function(i) -> texto del encabezado del tooltip }
   */
  function barChart(canvas, opts) {
    const st = canvas._chart || (canvas._chart = {});
    st.kind = 'bar';
    st.opts = opts;
    st.draw = hi => drawBars(canvas, st, hi);
    st.draw(-1);
    bindHover(canvas);
  }

  function drawBars(canvas, st, hi) {
    const opts = st.opts;
    const { ctx, w, h } = setup(canvas);
    const m = { l: 56, r: 30, t: 14, b: 38 };
    const pw = w - m.l - m.r, ph = h - m.t - m.b;
    const n = opts.values.length;
    const tipY = opts.tipY || defTip;
    // Altura máxima del eje: la que nos dan, o el mayor valor (o la referencia) más 12 % de margen.
    let ymax = opts.ymax !== undefined ? opts.ymax : Math.max(...opts.values, opts.ref ? opts.ref.y : 0) * 1.12;
    if (!(ymax > 0)) ymax = 1;   // por si todos los valores son 0
    const Y = y => m.t + (1 - y / ymax) * ph;   // en barras el eje y siempre empieza en 0
    const grid = css('--grid'), muted = css('--text-muted'), secondary = css('--text-secondary');

    // "slot" = espacio horizontal de cada barra; "bw" = ancho de la barra (70 % del espacio, máx. 48px)
    const slot = pw / n, bw = Math.max(2, Math.min(48, slot - 2 > 6 ? slot * 0.7 : slot - 2));
    st.plot = { l: m.l, t: m.t, pw, ph };
    st.slot = slot; st.n = n;

    // Rejilla horizontal y números del eje y
    ctx.strokeStyle = grid; ctx.lineWidth = 1; ctx.fillStyle = muted;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    niceTicks(0, ymax, 5).forEach(t => {
      const y = Math.round(Y(t)) + 0.5;
      ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(m.l + pw, y); ctx.stroke();
      ctx.fillText(fmt(t, opts.yDigits), m.l - 8, y);
    });

    opts.values.forEach((v, i) => {
      const x = m.l + slot * i + (slot - bw) / 2, y = Y(v), bh = m.t + ph - y;
      const r = Math.min(4, bw / 2, bh);   // radio de las esquinas redondeadas de arriba
      // degradado vertical en cada barra (un poco más claro arriba)
      const g = ctx.createLinearGradient(0, y, 0, m.t + ph);
      g.addColorStop(0, opts.color);
      g.addColorStop(1, withAlpha(opts.color, 0.72));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x, m.t + ph); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.lineTo(x + bw - r, y); ctx.quadraticCurveTo(x + bw, y, x + bw, y + r); ctx.lineTo(x + bw, m.t + ph);
      ctx.closePath(); ctx.fill();
      // barra bajo el mouse: velo claro encima
      if (i === hi) { ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fill(); }
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

    // Texto del tooltip para la barra i
    st.tip = i => {
      const head = opts.tipLabel ? opts.tipLabel(i) : opts.labels[i];
      let html = `<b>${head}</b><div>${tipY(opts.values[i])}</div>`;
      if (opts.ref) html += `<div class="tip-muted">${opts.ref.label}</div>`;
      return html;
    };
  }

  // Lo que dejamos disponible para app.js
  root.Charts = { lineChart, barChart, css, hideTip: tipHide };
})(window);
