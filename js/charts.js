/*
 * charts.js - Gráficos mínimos sobre <canvas> (sin librerías externas, funciona sin conexión).
 * Los colores se leen de las variables CSS para respetar modo claro/oscuro.
 */
(function (root) {
  'use strict';

  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function setup(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.font = '12px system-ui, -apple-system, "Segoe UI", sans-serif';
    return { ctx, w, h };
  }

  function niceTicks(min, max, count) {
    const span = max - min || 1;
    const raw = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
    const ticks = [];
    for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(+v.toPrecision(12));
    return ticks;
  }

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
    const m = { l: 56, r: 30, t: 14, b: 38 };
    const pw = w - m.l - m.r, ph = h - m.t - m.b;
    const xs = opts.xs;
    const xmin = opts.xlog ? Math.log10(xs[0]) : xs[0];
    const xmax = opts.xlog ? Math.log10(xs[xs.length - 1]) : xs[xs.length - 1];
    const X = x => m.l + ((opts.xlog ? Math.log10(x) : x) - xmin) / ((xmax - xmin) || 1) * pw;

    let ymin = opts.ymin, ymax = opts.ymax;
    if (ymin === undefined || ymax === undefined) {
      let lo = Infinity, hi = -Infinity;
      opts.series.forEach(s => s.ys.forEach(y => { if (y < lo) lo = y; if (y > hi) hi = y; }));
      if (opts.ref) { lo = Math.min(lo, opts.ref.y); hi = Math.max(hi, opts.ref.y); }
      const pad = (hi - lo) * 0.1 || 1;
      if (ymin === undefined) ymin = lo - pad;
      if (ymax === undefined) ymax = hi + pad;
    }
    const Y = y => m.t + (1 - (y - ymin) / ((ymax - ymin) || 1)) * ph;

    const grid = css('--grid'), muted = css('--text-muted'), secondary = css('--text-secondary');

    // Rejilla y ejes (recesivos)
    ctx.strokeStyle = grid; ctx.lineWidth = 1; ctx.fillStyle = muted;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    niceTicks(ymin, ymax, 5).forEach(t => {
      const y = Math.round(Y(t)) + 0.5;
      ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(m.l + pw, y); ctx.stroke();
      ctx.fillText(fmt(t, opts.yDigits), m.l - 8, y);
    });
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
    ctx.strokeStyle = muted;
    ctx.beginPath(); ctx.moveTo(m.l, m.t + ph + 0.5); ctx.lineTo(m.l + pw, m.t + ph + 0.5); ctx.stroke();

    ctx.save();
    ctx.beginPath(); ctx.rect(m.l, m.t, pw, ph); ctx.clip();

    // Banda de confianza
    if (opts.band) {
      ctx.fillStyle = opts.band.color; ctx.globalAlpha = 0.18;
      ctx.beginPath();
      xs.forEach((x, i) => { const px = X(x), py = Y(opts.band.hi[i]); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
      for (let i = xs.length - 1; i >= 0; i--) ctx.lineTo(X(xs[i]), Y(opts.band.lo[i]));
      ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    }

    // Referencia teórica
    if (opts.ref) {
      ctx.strokeStyle = secondary; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
      const y = Y(opts.ref.y);
      ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(m.l + pw, y); ctx.stroke(); ctx.setLineDash([]);
    }

    // Series
    opts.series.forEach(s => {
      ctx.strokeStyle = s.color; ctx.lineWidth = 2; ctx.lineJoin = 'round';
      ctx.setLineDash(s.dash || []);
      ctx.beginPath();
      xs.forEach((x, i) => { const px = X(x), py = Y(s.ys[i]); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
      ctx.stroke(); ctx.setLineDash([]);
    });
    ctx.restore();

    // Etiqueta de la referencia
    if (opts.ref) {
      ctx.fillStyle = secondary; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      ctx.fillText(opts.ref.label, m.l + pw - 4, Y(opts.ref.y) - 4);
    }
    // Títulos de ejes
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
    let ymax = opts.ymax !== undefined ? opts.ymax : Math.max(...opts.values, opts.ref ? opts.ref.y : 0) * 1.12;
    if (!(ymax > 0)) ymax = 1;
    const Y = y => m.t + (1 - y / ymax) * ph;
    const grid = css('--grid'), muted = css('--text-muted'), secondary = css('--text-secondary');

    ctx.strokeStyle = grid; ctx.lineWidth = 1; ctx.fillStyle = muted;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    niceTicks(0, ymax, 5).forEach(t => {
      const y = Math.round(Y(t)) + 0.5;
      ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(m.l + pw, y); ctx.stroke();
      ctx.fillText(fmt(t, opts.yDigits), m.l - 8, y);
    });

    const slot = pw / n, bw = Math.max(2, Math.min(48, slot - 2 > 6 ? slot * 0.7 : slot - 2));
    ctx.fillStyle = opts.color;
    opts.values.forEach((v, i) => {
      const x = m.l + slot * i + (slot - bw) / 2, y = Y(v), bh = m.t + ph - y;
      const r = Math.min(4, bw / 2, bh);
      ctx.beginPath();
      ctx.moveTo(x, m.t + ph); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.lineTo(x + bw - r, y); ctx.quadraticCurveTo(x + bw, y, x + bw, y + r); ctx.lineTo(x + bw, m.t + ph);
      ctx.closePath(); ctx.fill();
    });

    // Etiquetas del eje x (saltando algunas si no caben)
    ctx.fillStyle = muted; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const every = Math.ceil(n / Math.max(1, Math.floor(pw / 48)));
    opts.labels.forEach((l, i) => { if (i % every === 0) ctx.fillText(l, m.l + slot * (i + 0.5), m.t + ph + 7); });
    ctx.strokeStyle = muted;
    ctx.beginPath(); ctx.moveTo(m.l, m.t + ph + 0.5); ctx.lineTo(m.l + pw, m.t + ph + 0.5); ctx.stroke();

    if (opts.ref) {
      ctx.strokeStyle = secondary; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
      const y = Y(opts.ref.y);
      ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(m.l + pw, y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = secondary; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      ctx.fillText(opts.ref.label, m.l + pw - 4, y - 4);
    }
    ctx.fillStyle = secondary; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    if (opts.xLabel) ctx.fillText(opts.xLabel, m.l + pw / 2, h - 2);
    if (opts.yLabel) {
      ctx.save(); ctx.translate(12, m.t + ph / 2); ctx.rotate(-Math.PI / 2);
      ctx.textBaseline = 'top'; ctx.fillText(opts.yLabel, 0, -6); ctx.restore();
    }
  }

  root.Charts = { lineChart, barChart, css };
})(window);
