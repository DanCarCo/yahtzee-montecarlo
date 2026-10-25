# Laboratorio Yahtzee · Método de Montecarlo

Simulación del Yahtzee clásico para **2 jugadores** y laboratorio de simulación Montecarlo para verificar la **Ley de los Grandes Números**.
Actividad didáctica 2-M1.

## Cómo ejecutarlo

**Aplicación (juego + experimentos)**, a elegir una de estas dos opciones:

- **En línea:** abrir <https://dancarco.github.io/yahtzee-montecarlo/> en cualquier navegador moderno.
- **Local:** descargar o clonar el repositorio y abrir [`index.html`](index.html) con doble clic. No requiere instalación, servidor ni conexión a internet.

**Pruebas del motor** (requiere [Node.js](https://nodejs.org) 18+):

```bash
node tests/engine.test.js
```

## Qué contiene la aplicación

| Pestaña | Contenido |
|---|---|
| **Jugar** | Partida completa de 2 jugadores (humano o computadora): 3 lanzamientos por turno, retener dados, 13 casillas, bono superior (+35), Yahtzee extra (+100) y regla del comodín. Muestra la puntuación potencial de cada casilla y estadísticas en vivo (frecuencias, media, χ²). |
| **Simulación Montecarlo** | 4 experimentos con semilla opcional, gráficos de convergencia con bandas de confianza y comparación con valores teóricos exactos. |
| **Metodología** | Modelo probabilístico, reglas y jugador computadora. |

### Experimentos Montecarlo

1. **Un dado:** media acumulada → 3,5 y frecuencias → 1/6, con banda ±1,96·σ/√n y prueba χ².
2. **Cinco dados, una tirada:** tercia, póker, full house, escaleras y Yahtzee frente a probabilidades exactas (enumeración de 7 776 casos).
3. **Yahtzee en un turno completo:** frecuencia frente a la probabilidad exacta (≈ 4,60 %, programación dinámica).
4. **Partidas completas:** puntaje medio, desviación, IC 95 %, histograma, proporción de victorias y convergencia; dos computadoras con la misma regla de decisión (equidad del juego: empezar primero no da ventaja).

## Estructura del repositorio

```
index.html                 Aplicación
css/styles.css             Estilos (modo claro/oscuro)
js/engine.js               Reglas, PRNG con semilla, jugador computadora, probabilidades exactas, estadística
js/app.js                  Interfaz del juego y de los experimentos
js/charts.js               Gráficos en canvas con tooltip (sin librerías externas)
js/icons.js                Iconos SVG propios
js/fx.js                   Efectos: confeti y avisos
tests/engine.test.js       14 pruebas del motor
guia_original/             Archivos de partida (HTML y React) sin modificar
```

## USA · MODIFICA · CREA

| Etapa | Qué se hizo |
|---|---|
| **USA** | Se ejecutó y analizó la guía (`guia_original/`). Se detectó que el HTML estaba truncado (terminaba a mitad de `resetGame()`, sin `initGame()` ni cierre de etiquetas) y que la versión React nunca terminaba la partida. |
| **MODIFICA** | Se corrigieron los errores y se completaron las reglas: fin de partida (el chequeo usaba el estado anterior a la última jugada); estadísticas solo con dados recién lanzados (la guía contaba varias veces los dados retenidos → muestras no independientes); tabla de probabilidades (escalera pequeña es 15,43 %, no 12,35 %); bono superior, Yahtzee extra y comodín. |
| **CREA** | Motor reutilizable en navegador y Node, PRNG con semilla, interfaz rediseñada (rojo, negro y dorado) con tooltips en los gráficos, 4 experimentos Montecarlo, probabilidades exactas, jugador computadora, estadística en línea (Welford), pruebas unitarias. |
