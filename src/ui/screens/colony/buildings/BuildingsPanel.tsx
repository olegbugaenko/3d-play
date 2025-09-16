import React, { useState } from 'react';
import { BuildingsModal } from './BuildingsModal';
import { useInteractionContext } from '@ui/screens/colony/scene/context/InteractionContext';

interface BuildingsPanelProps {
  game: any; // Game instance
  onSelectBuilding?: (typeId: string) => void;
}

export const BuildingsPanel: React.FC<BuildingsPanelProps> = ({ game, onSelectBuilding }) => {
  const [isBuildingsModalOpen, setIsBuildingsModalOpen] = useState(false);
  const interactionManager = useInteractionContext();

  // Перевіряємо чи досліджено building_constructions
  const isBuildingConstructionsUnlocked = game.upgradesManager.isUnlocked('building_constructions');
  
  // Перевіряємо чи апгрейд фактично куплений (рівень > 0)
  const buildingConstructionsState = game.upgradesManager.getUpgradeState('building_constructions');
  const isBuildingConstructionsPurchased = buildingConstructionsState?.level > 0;

  const handleSelectBuilding = (typeId: string) => {
    // Виводимо ID будівлі в дебаг панель
    console.log('Selected building for construction:', typeId);
    
    // Отримуємо повні дані про будівлю
    const buildingData = game.buildingsManager.getBuildingType(typeId);
    console.log('Building data:', buildingData);
    
    // Закриваємо модалку після вибору будівлі
    setIsBuildingsModalOpen(false);
    
    // Переходимо в режим будівництва
    if (interactionManager) {
      interactionManager.setMode('building');
      // Передаємо дані про вибрану будівлю в BuildingHandler
      if (interactionManager.setSelectedBuilding) {
        interactionManager.setSelectedBuilding(buildingData);
      }
    }
    
    // Викликаємо callback з батьківського компонента
    if (onSelectBuilding) {
      onSelectBuilding(typeId);
    }
  };

  // Не показуємо кнопку якщо building_constructions не досліджено АБО не куплено
  if (!isBuildingConstructionsUnlocked || !isBuildingConstructionsPurchased) {
    return null;
  }

  // Отримуємо список будівель для відображення
  const buildings = game.buildingsManager.listBuildingsForUI();

  return (
    <BuildingsModal
      isOpen={isBuildingsModalOpen}
      onClose={() => setIsBuildingsModalOpen(false)}
      buildings={buildings}
      onSelectBuilding={handleSelectBuilding}
    />
  );
};

// Хук для отримання даних кнопки меню
export const useBuildingsMenuButton = (game: any, onSelectBuilding?: (typeId: string) => void) => {
  const [isBuildingsModalOpen, setIsBuildingsModalOpen] = useState(false);
  const interactionManager = useInteractionContext();

  // Перевіряємо чи досліджено building_constructions
  const isBuildingConstructionsUnlocked = game.upgradesManager.isUnlocked('building_constructions');
  
  // Перевіряємо чи апгрейд фактично куплений (рівень > 0)
  const buildingConstructionsState = game.upgradesManager.getUpgradeState('building_constructions');
  const isBuildingConstructionsPurchased = buildingConstructionsState?.level > 0;

  const handleBuildingsClick = () => {
    setIsBuildingsModalOpen(true);
  };

  const handleSelectBuilding = (typeId: string) => {
    console.log('Selected building for construction:', typeId);
    
    const buildingData = game.buildingsManager.getBuildingType(typeId);
    console.log('Building data:', buildingData);
    
    setIsBuildingsModalOpen(false);
    
    if (interactionManager) {
      interactionManager.setMode('building');
      if (interactionManager.setSelectedBuilding) {
        interactionManager.setSelectedBuilding(buildingData);
      }
    }
    
    if (onSelectBuilding) {
      onSelectBuilding(typeId);
    }
  };

  const buildings = game.buildingsManager.listBuildingsForUI();

  return {
    button: {
      id: 'buildings',
      iconId: 'interface/build.png',
      variant: 'primary' as const,
      onClick: handleBuildingsClick,
      title: 'Build',
      visible: isBuildingConstructionsUnlocked && isBuildingConstructionsPurchased
    },
    modal: (
      <BuildingsModal
        isOpen={isBuildingsModalOpen}
        onClose={() => setIsBuildingsModalOpen(false)}
        buildings={buildings}
        onSelectBuilding={handleSelectBuilding}
      />
    )
  };
};
