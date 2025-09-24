import { useState, useEffect } from 'react';
// import { Scene3D } from '@ui/screens/colony/scene/Scene3D';
import { MainMenu, Scene3D } from './ui';
import { ResourcesBar } from '@ui/screens/colony/ui-controls/ResourcesBar';
import { GlobalTimeDisplay } from '@ui/screens/colony/ui-controls/GlobalTimeDisplay';
import { Game } from '@core/game/game';
import './App.css';
import type { IMapLogic } from '@interfaces/index';

function App() {
  const [showMainMenu, setShowMainMenu] = useState(true);
  const [game] = useState(() => Game.getInstance());
  const [isGameInitialized, setIsGameInitialized] = useState(false);
  
  // Ініціалізуємо гру при першому рендері
  useEffect(() => {
    game.initGame();
    setIsGameInitialized(true);

    // Експортуємо debug функції для браузера
    (window as any).debugGame = {
      storage: (buildingId?: string) => game.debugBuildingStorage(buildingId),
      game: game
    };
    console.log('[App] Debug functions available: window.debugGame.storage(), window.debugGame.game');

    return () => {
      game.stopTicks();
      delete (window as any).debugGame;
    };
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
        <>
          <ResourcesBar resourceManager={game.mapLogic.resources} />
          <GlobalTimeDisplay environment={game.mapLogic.environment} />
          <Scene3D
            saveManager={game.saveManager}
            onShowMainMenu={handleShowMainMenu}
            mapLogic={game.mapLogic as unknown as IMapLogic}
            game={game}
          />
        </>
      )}
    </div>
  );
}

export default App;
