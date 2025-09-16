import React, { useState } from 'react';
import { UpgradesModal } from '../UpgradesModal';

interface UpgradesPanelProps {
  game: any; // Game instance
}

export const UpgradesPanel: React.FC<UpgradesPanelProps> = ({ game }) => {
  const [isUpgradesModalOpen, setIsUpgradesModalOpen] = useState(false);
  const [upgradesVersion, setUpgradesVersion] = useState(0); // Для force re-render

  const handlePurchaseUpgrade = (typeId: string) => {
    const success = game.upgradesManager.purchaseUpgrade(typeId);
    if (success) {
      // Force re-render після успішної покупки
      setUpgradesVersion(prev => prev + 1);
    }
  };

  return (
    <UpgradesModal
      isOpen={isUpgradesModalOpen}
      onClose={() => setIsUpgradesModalOpen(false)}
      upgrades={game.upgradesManager.listUpgradesForUI()}
      onPurchaseUpgrade={handlePurchaseUpgrade}
      key={upgradesVersion} // Force re-render коли змінюється версія
    />
  );
};

// Хук для отримання даних кнопки меню
export const useUpgradesMenuButton = (game: any) => {
  const [isUpgradesModalOpen, setIsUpgradesModalOpen] = useState(false);
  const [upgradesVersion, setUpgradesVersion] = useState(0);

  const handleUpgradesClick = () => {
    setIsUpgradesModalOpen(true);
  };

  const handlePurchaseUpgrade = (typeId: string) => {
    const success = game.upgradesManager.purchaseUpgrade(typeId);
    if (success) {
      setUpgradesVersion(prev => prev + 1);
    }
  };

  return {
    button: {
      id: 'upgrades',
      iconId: 'interface/upgrade.png',
      variant: 'primary' as const,
      onClick: handleUpgradesClick,
      title: 'Upgrades',
      visible: true
    },
    modal: (
      <UpgradesModal
        isOpen={isUpgradesModalOpen}
        onClose={() => setIsUpgradesModalOpen(false)}
        upgrades={game.upgradesManager.listUpgradesForUI()}
        onPurchaseUpgrade={handlePurchaseUpgrade}
        key={upgradesVersion}
      />
    )
  };
};
