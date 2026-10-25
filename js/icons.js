/*
 * icons.js - Iconos SVG propios (sin librerías ni internet).
 *
 * Todos son de 24x24, solo con trazo (stroke) y toman el color del texto (currentColor),
 * así cambian solos con el tema. En el HTML se usan así:
 *     <span class="ico" data-icon="dice"></span>
 * y Icons.hydrate() reemplaza ese span por el SVG.
 */
(function (root) {
  'use strict';

  // Cada icono es solo el contenido interno del <svg>.
  const PATHS = {
    dice: '<rect x="3" y="3" width="18" height="18" rx="3.5"/><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>',
    trophy: '<path d="M8 21h8M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><circle cx="12" cy="4" r="1.2"/><path d="M12 5v3M9 13h.01M15 13h.01M9.5 17h5"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
    sigma: '<path d="M18 5H6l6 7-6 7h12"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    flask: '<path d="M9 3h6M10 3v6l-5.5 10a1.6 1.6 0 0 0 1.4 2.3h12.2a1.6 1.6 0 0 0 1.4-2.3L14 9V3"/><path d="M7.5 15h9"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5z"/><path d="M8 7h7"/>',
    play: '<path d="M7 4l13 8-13 8V4z"/>',
    percent: '<path d="M19 5L5 19"/><circle cx="7" cy="7" r="2"/><circle cx="17" cy="17" r="2"/>',
    star: '<path d="M12 3l2.6 5.9 6.4.6-4.8 4.3 1.4 6.3L12 16.8 6.4 20.1l1.4-6.3L3 9.5l6.4-.6z"/>',
    hash: '<path d="M5 9h14M5 15h14M9 4L7 20M17 4l-2 16"/>',
    scale: '<path d="M12 3v18M6 21h12"/><path d="M5 7h14"/><path d="M5 7l-3 7a3 3 0 0 0 6 0L5 7zM19 7l-3 7a3 3 0 0 0 6 0l-3-7z"/>',
    ruler: '<rect x="2" y="8" width="20" height="8" rx="1.5"/><path d="M6 8v3M10 8v4M14 8v3M18 8v4"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8z"/><path d="M10 20a2 2 0 0 0 4 0"/>'
  };

  // Devuelve el texto SVG de un icono (o vacío si no existe).
  function svg(name, size) {
    const p = PATHS[name];
    if (!p) return '';
    const s = size || 20;
    return `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${p}</svg>`;
  }

  // Busca todos los elementos con data-icon y les pone dentro su SVG.
  // "root" es opcional: sirve para hidratar solo una parte nueva de la página.
  function hydrate(scope) {
    (scope || document).querySelectorAll('[data-icon]').forEach(el => {
      if (el.dataset.done) return;               // ya se procesó
      el.innerHTML = svg(el.dataset.icon, Number(el.dataset.size) || 20);
      el.dataset.done = '1';
    });
  }

  root.Icons = { svg, hydrate };
})(window);
