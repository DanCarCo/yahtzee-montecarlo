function App() {
  const [gameState, setGameState] = React.useState('setup');
  const [currentPlayer, setCurrentPlayer] = React.useState(1);
  const [dice, setDice] = React.useState([1, 2, 3, 4, 5]);
  const [locked, setLocked] = React.useState([false, false, false, false, false]);
  const [rollsLeft, setRollsLeft] = React.useState(3);
  const [scores, setScores] = React.useState({
    player1: { ones: null, twos: null, threes: null, fours: null, fives: null, sixes: null, threeOfKind: null, fourOfKind: null, fullHouse: null, smallStraight: null, largeStraight: null, yahtzee: null, chance: null },
    player2: { ones: null, twos: null, threes: null, fours: null, fives: null, sixes: null, threeOfKind: null, fourOfKind: null, fullHouse: null, smallStraight: null, largeStraight: null, yahtzee: null, chance: null }
  });
  const [statistics, setStatistics] = React.useState({
    totalRolls: 0,
    diceFrequency: [0, 0, 0, 0, 0, 0],
    yahtzeeCount: 0
  });

  const rollDice = () => {
    if (rollsLeft > 0) {
      const newDice = dice.map((die, index) => 
        locked[index] ? die : Math.floor(Math.random() * 6) + 1
      );
      setDice(newDice);
      setRollsLeft(rollsLeft - 1);
      
      setStatistics(prev => ({
        ...prev,
        totalRolls: prev.totalRolls + 1,
        diceFrequency: prev.diceFrequency.map((count, i) => 
          count + newDice.filter(d => d === i + 1).length
        )
      }));
    }
  };

  const toggleLock = (index) => {
    if (rollsLeft < 3) {
      const newLocked = [...locked];
      newLocked[index] = !newLocked[index];
      setLocked(newLocked);
    }
  };

  const calculateScore = (category) => {
    const counts = [0, 0, 0, 0, 0, 0];
    dice.forEach(die => counts[die - 1]++);
    
    switch(category) {
      case 'ones': return counts[0] * 1;
      case 'twos': return counts[1] * 2;
      case 'threes': return counts[2] * 3;
      case 'fours': return counts[3] * 4;
      case 'fives': return counts[4] * 5;
      case 'sixes': return counts[5] * 6;
      case 'threeOfKind': 
        return counts.some(c => c >= 3) ? dice.reduce((a, b) => a + b, 0) : 0;
      case 'fourOfKind': 
        return counts.some(c => c >= 4) ? dice.reduce((a, b) => a + b, 0) : 0;
      case 'fullHouse': 
        return (counts.includes(3) && counts.includes(2)) ? 25 : 0;
      case 'smallStraight': 
        const sorted = [...new Set(dice)].sort();
        const hasSmall = sorted.join('').includes('1234') || sorted.join('').includes('2345') || sorted.join('').includes('3456');
        return hasSmall ? 30 : 0;
      case 'largeStraight': 
        const sortedLarge = [...dice].sort().join('');
        return (sortedLarge === '12345' || sortedLarge === '23456') ? 40 : 0;
      case 'yahtzee': 
        const isYahtzee = counts.some(c => c === 5);
        if (isYahtzee) {
          setStatistics(prev => ({ ...prev, yahtzeeCount: prev.yahtzeeCount + 1 }));
        }
        return isYahtzee ? 50 : 0;
      case 'chance': 
        return dice.reduce((a, b) => a + b, 0);
      default: return 0;
    }
  };

  const selectCategory = (category) => {
    const playerKey = `player${currentPlayer}`;
    if (scores[playerKey][category] === null && rollsLeft < 3) {
      const score = calculateScore(category);
      setScores({
        ...scores,
        [playerKey]: { ...scores[playerKey], [category]: score }
      });
      
      const allCategoriesFilled = Object.values(scores.player1).every(v => v !== null) && 
                                   Object.values(scores.player2).every(v => v !== null);
      
      if (allCategoriesFilled) {
        setGameState('finished');
      } else {
        setCurrentPlayer(currentPlayer === 1 ? 2 : 1);
        setDice([1, 2, 3, 4, 5]);
        setLocked([false, false, false, false, false]);
        setRollsLeft(3);
      }
    }
  };

  const getTotalScore = (player) => {
    return Object.values(scores[`player${player}`])
      .filter(v => v !== null)
      .reduce((a, b) => a + b, 0);
  };

  const startGame = () => {
    setGameState('playing');
  };

  const resetGame = () => {
    setGameState('setup');
    setCurrentPlayer(1);
    setDice([1, 2, 3, 4, 5]);
    setLocked([false, false, false, false, false]);
    setRollsLeft(3);
    setScores({
      player1: { ones: null, twos: null, threes: null, fours: null, fives: null, sixes: null, threeOfKind: null, fourOfKind: null, fullHouse: null, smallStraight: null, largeStraight: null, yahtzee: null, chance: null },
      player2: { ones: null, twos: null, threes: null, fours: null, fives: null, sixes: null, threeOfKind: null, fourOfKind: null, fullHouse: null, smallStraight: null, largeStraight: null, yahtzee: null, chance: null }
    });
  };

  const categoryNames = {
    ones: 'Unos (1s)',
    twos: 'Doses (2s)',
    threes: 'Treses (3s)',
    fours: 'Cuatros (4s)',
    fives: 'Cincos (5s)',
    sixes: 'Seises (6s)',
    threeOfKind: 'Tercia',
    fourOfKind: 'Póker',
    fullHouse: 'Full House',
    smallStraight: 'Escalera Pequeña',
    largeStraight: 'Escalera Grande',
    yahtzee: 'Yahtzee',
    chance: 'Suerte'
  };

  if (gameState === 'setup') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-12 max-w-2xl w-full text-center">
          <h1 className="text-5xl font-bold text-purple-900 mb-6">🎲 Yahtzee Montecarlo 🎲</h1>
          <p className="text-xl text-gray-700 mb-8">Simulación del juego clásico de Yahtzee para 2 jugadores usando el método de Montecarlo</p>
          <div className="bg-purple-50 rounded-xl p-6 mb-8">
            <h2 className="text-2xl font-bold text-purple-800 mb-4">Reglas del Juego</h2>
            <ul className="text-left text-gray-700 space-y-2">
              <li>✓ Cada jugador tiene 3 lanzamientos por turno</li>
              <li>✓ Puedes bloquear dados entre lanzamientos</li>
              <li>✓ Selecciona una categoría al final de tu turno</li>
              <li>✓ Cada categoría solo se puede usar una vez</li>
              <li>✓ El jugador con más puntos gana</li>
            </ul>
          </div>
          <button 
            onClick={startGame}
            className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-12 py-4 rounded-full text-2xl font-bold hover:from-purple-700 hover:to-blue-700 transform hover:scale-105 transition-all shadow-lg"
          >
            Iniciar Juego
          </button>
        </div>
      </div>
    );
  }

  if (gameState === 'finished') {
    const winner = getTotalScore(1) > getTotalScore(2) ? 1 : getTotalScore(2) > getTotalScore(1) ? 2 : 0;
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-12 max-w-2xl w-full text-center">
          <h1 className="text-5xl font-bold text-purple-900 mb-6">🏆 Juego Terminado 🏆</h1>
          <div className="space-y-4 mb-8">
            <div className={`p-6 rounded-xl ${winner === 1 ? 'bg-yellow-100 border-4 border-yellow-500' : 'bg-gray-100'}`}>
              <h2 className="text-3xl font-bold text-purple-800">Jugador 1: {getTotalScore(1)} puntos</h2>
              {winner === 1 && <p className="text-2xl text-yellow-600 font-bold mt-2">¡GANADOR!</p>}
            </div>
            <div className={`p-6 rounded-xl ${winner === 2 ? 'bg-yellow-100 border-4 border-yellow-500' : 'bg-gray-100'}`}>
              <h2 className="text-3xl font-bold text-blue-800">Jugador 2: {getTotalScore(2)} puntos</h2>
              {winner === 2 && <p className="text-2xl text-yellow-600 font-bold mt-2">¡GANADOR!</p>}
            </div>
            {winner === 0 && <p className="text-2xl text-gray-600 font-bold">¡EMPATE!</p>}
          </div>
          <div className="bg-blue-50 rounded-xl p-6 mb-8">
            <h3 className="text-2xl font-bold text-blue-800 mb-4">Estadísticas del Juego</h3>
            <p className="text-lg text-gray-700">Total de lanzamientos: {statistics.totalRolls}</p>
            <p className="text-lg text-gray-700">Yahtzees obtenidos: {statistics.yahtzeeCount}</p>
          </div>
          <button 
            onClick={resetGame}
            className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-12 py-4 rounded-full text-2xl font-bold hover:from-purple-700 hover:to-blue-700 transform hover:scale-105 transition-all shadow-lg"
          >
            Jugar de Nuevo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-3xl shadow-2xl p-8 mb-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-4xl font-bold text-purple-900">🎲 Yahtzee Montecarlo</h1>
            <div className="text-right">
              <p className="text-2xl font-bold text-purple-800">Turno: Jugador {currentPlayer}</p>
              <p className="text-lg text-gray-600">Lanzamientos restantes: {rollsLeft}</p>
            </div>
          </div>

          <div className="flex justify-center gap-4 mb-6">
            {dice.map((die, index) => (
              <div
                key={index}
                onClick={() => toggleLock(index)}
                className={`w-20 h-20 flex items-center justify-center text-4xl font-bold rounded-xl cursor-pointer transform transition-all hover:scale-110 ${
                  locked[index] 
                    ? 'bg-red-500 text-white shadow-lg' 
                    : 'bg-white text-purple-900 border-4 border-purple-500'
                }`}
              >
                {die}
              </div>
            ))}
          </div>

          <div className="text-center mb-6">
            <button
              onClick={rollDice}
              disabled={rollsLeft === 0}
              className={`px-8 py-3 rounded-full text-xl font-bold transition-all ${
                rollsLeft > 0
                  ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700 transform hover:scale-105 shadow-lg'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              🎲 Lanzar Dados ({rollsLeft})
            </button>
            <p className="text-sm text-gray-600 mt-2">Haz clic en los dados para bloquearlos</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-3xl shadow-2xl p-6">
            <h2 className="text-2xl font-bold text-purple-800 mb-4">📊 Tabla de Puntuación</h2>
            <div className="space-y-2">
              {Object.keys(categoryNames).map(category => (
                <div
                  key={category}
                  onClick={() => selectCategory(category)}
                  className={`p-3 rounded-lg flex justify-between items-center cursor-pointer transition-all ${
                    scores[`player${currentPlayer}`][category] === null && rollsLeft < 3
                      ? 'bg-purple-50 hover:bg-purple-100 border-2 border-purple-300'
                      : 'bg-gray-100 cursor-not-allowed'
                  }`}
                >
                  <span className="font-semibold text-gray-700">{categoryNames[category]}</span>
                  <div className="flex gap-4">
                    <span className={`font-bold ${scores.player1[category] !== null ? 'text-purple-600' : 'text-gray-400'}`}>
                      J1: {scores.player1[category] !== null ? scores.player1[category] : '-'}
                    </span>
                    <span className={`font-bold ${scores.player2[category] !== null ? 'text-blue-600' : 'text-gray-400'}`}>
                      J2: {scores.player2[category] !== null ? scores.player2[category] : '-'}
                    </span>
                  </div>
                </div>
              ))}
              <div className="pt-4 border-t-2 border-gray-300">
                <div className="flex justify-between items-center font-bold text-xl">
                  <span>TOTAL</span>
                  <div className="flex gap-4">
                    <span className="text-purple-600">J1: {getTotalScore(1)}</span>
                    <span className="text-blue-600">J2: {getTotalScore(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl shadow-2xl p-6">
            <h2 className="text-2xl font-bold text-blue-800 mb-4">📈 Estadísticas en Tiempo Real</h2>
            <div className="space-y-4">
              <div className="bg-blue-50 rounded-lg p-4">
                <p className="text-lg font-semibold text-gray-700">Total de lanzamientos: <span className="text-blue-600">{statistics.totalRolls}</span></p>
              </div>
              <div className="bg-blue-50 rounded-lg p-4">
                <p className="text-lg font-semibold text-gray-700 mb-2">Frecuencia de dados:</p>
                {statistics.diceFrequency.map((count, index) => (
                  <div key={index} className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-purple-600 w-8">{index + 1}:</span>
                    <div className="flex-1 bg-gray-200 rounded-full h-6">
                      <div 
                        className="bg-gradient-to-r from-purple-500 to-blue-500 h-6 rounded-full flex items-center justify-end pr-2"
                        style={{ width: `${statistics.totalRolls > 0 ? (count / statistics.totalRolls * 5 * 100) : 0}%` }}
                      >
                        <span className="text-white text-xs font-bold">{count}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="bg-yellow-50 rounded-lg p-4">
                <p className="text-lg font-semibold text-gray-700">🎯 Yahtzees obtenidos: <span className="text-yellow-600 text-2xl">{statistics.yahtzeeCount}</span></p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}