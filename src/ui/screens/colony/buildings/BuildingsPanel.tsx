import React, { useState } from 'react';
import { BuildingsModal } from './BuildingsModal';

interface BuildingsPanelProps {
  game: any; // Game instance
  onSelectBuilding?: (typeId: string) => void;
}

export const BuildingsPanel: React.FC<BuildingsPanelProps> = ({ game, onSelectBuilding }) => {
  const [isBuildingsModalOpen, setIsBuildingsModalOpen] = useState(false);

  // Перевіряємо чи досліджено building_constructions
  const isBuildingConstructionsUnlocked = game.upgradesManager.isUnlocked('building_constructions');

  const handleBuildingsClick = () => {
    setIsBuildingsModalOpen(true);
  };

  const handleSelectBuilding = (typeId: string) => {
    // Закриваємо модалку після вибору будівлі
    setIsBuildingsModalOpen(false);
    // Викликаємо callback з батьківського компонента
    if (onSelectBuilding) {
      onSelectBuilding(typeId);
    }
  };

  // Не показуємо кнопку якщо building_constructions не досліджено
  if (!isBuildingConstructionsUnlocked) {
    return null;
  }

  // Отримуємо список будівель для відображення
  const buildings = game.buildingsManager.listBuildingsForUI();

  return (
    <>
      <button
        onClick={handleBuildingsClick}
        style={{
          position: 'absolute',
          top: 170, // Під кнопкою Upgrades
          right: 10,
          padding: '8px 16px',
          backgroundColor: '#FF9800',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '14px',
          zIndex: 1000,
          fontWeight: 'bold'
        }}
      >
        Build
      </button>

      <BuildingsModal
        isOpen={isBuildingsModalOpen}
        onClose={() => setIsBuildingsModalOpen(false)}
        buildings={buildings}
        onSelectBuilding={handleSelectBuilding}
      />
    </>
  );
};
