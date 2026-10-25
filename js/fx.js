/*
 * fx.js - Efectos visuales: confeti y aviso flotante ("toast").
 *
 * Se usan cuando sale un Yahtzee y al terminar la partida. Si la persona tiene activada
 * la opción del sistema "reducir movimiento", NO hay confeti (solo el aviso de texto).
 */
(function (root) {
  'use strict';

  const reduce = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let canvas = null, ctx = null, particles = [], running = false;

  // Crea (una sola vez) el canvas que cubre toda la pantalla y no estorba al mouse.
  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.id = 'fx';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
  }
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Colores del confeti: la paleta del proyecto (dorado, rojo y marfil)
  const COLORS = ['#e7cd86', '#c9a24a', '#b3263a', '#8c1c2b', '#f4ecdc'];

  // Lanza una ráfaga de partículas desde el punto (x, y) en píxeles de la ventana.
  function confetti(x, y, count) {
    if (reduce()) return;
    ensureCanvas(); resize();
    const n = count || 140;
    for (let i = 0; i < n; i++) {
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;   // hacia arriba, en abanico
      const sp = 5 + Math.random() * 9;
      particles.push({
        x, y,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        w: 5 + Math.random() * 6, h: 3 + Math.random() * 4,
        rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        life: 0, max: 90 + Math.random() * 60
      });
    }
    if (!running) { running = true; requestAnimationFrame(tick); }
  }

  // Un "cuadro" de la animación: mueve cada partícula (gravedad + rozamiento) y la dibuja.
  function tick() {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    particles = particles.filter(p => p.life < p.max);
    particles.forEach(p => {
      p.life++;
      p.vy += 0.28;          // gravedad
      p.vx *= 0.985;         // rozamiento del aire
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - p.life / p.max);
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    if (particles.length) requestAnimationFrame(tick);
    else { running = false; ctx.clearRect(0, 0, window.innerWidth, window.innerHeight); }
  }

  // Aviso grande y elegante en el centro superior de la pantalla.
  let toastEl = null, toastTimer = null;
  function toast(text) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      toastEl.setAttribute('role', 'status');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = text;
    toastEl.classList.remove('show');
    void toastEl.offsetWidth;                 // truco para reiniciar la animación CSS
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
  }

  // Celebración completa: aviso + confeti desde el centro de la pantalla.
  function celebrate(text) {
    toast(text);
    confetti(window.innerWidth / 2, window.innerHeight * 0.45);
  }

  root.Fx = { confetti, toast, celebrate };
})(window);
