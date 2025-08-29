import { useState, useEffect } from 'react';
import Scene3D from './components/Scene3D';
import { MainMenu } from './components/MainMenu';
import { Game } from '@core/game/game';
import './App.css';

function App() {
  const [showMainMenu, setShowMainMenu] = useState(true);
  const [game] = useState(() => Game.getInstance());
  const [isGameInitialized, setIsGameInitialized] = useState(false);
  
  // Ініціалізуємо гру при першому рендері
  useEffect(() => {
    game.initGame();
    setIsGameInitialized(true);
  }, [game]);

  const handleStartGame = () => {

    setShowMainMenu(false);
  };

  const handleShowMainMenu = () => {
    setShowMainMenu(true);
  };

  // Показуємо MainMenu тільки після ініціалізації гри
  if (!isGameInitialized) {
    return <div>Loading...</div>;
  }

  return (
    <div className="App">
      {showMainMenu ? (
        <MainMenu 
          onStartGame={handleStartGame}
          game={game}
        />
      ) : (
        <Scene3D 
          saveManager={game.saveManager}
          onShowMainMenu={handleShowMainMenu}
          mapLogic={game.mapLogic}
          game={game}
        />
      )}
    </div>
  );
}

export default App;
