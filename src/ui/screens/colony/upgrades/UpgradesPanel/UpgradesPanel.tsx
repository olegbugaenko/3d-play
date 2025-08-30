import React, { useState } from 'react';
import { UpgradesModal } from '../UpgradesModal';

interface UpgradesPanelProps {
  game: any; // Game instance
}

export const UpgradesPanel: React.FC<UpgradesPanelProps> = ({ game }) => {
  const [isUpgradesModalOpen, setIsUpgradesModalOpen] = useState(false);

  const handleUpgradesClick = () => {
    setIsUpgradesModalOpen(true);
  };

  const handlePurchaseUpgrade = (typeId: string) => {
    const success = game.upgradesManager.purchaseUpgrade(typeId);
    if (success) {
      // НЕ закриваємо модалку при кожному кліку!
      // setIsUpgradesModalOpen(false);
    }
  };

  return (
    <>
      <button
        onClick={handleUpgradesClick}
        style={{
          position: 'absolute',
          top: 90,
          right: 10,
          padding: '8px 16px',
          backgroundColor: '#FF9800',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '14px',
          zIndex: 1000
        }}
      >
        Upgrades
      </button>

      <UpgradesModal
        isOpen={isUpgradesModalOpen}
        onClose={() => setIsUpgradesModalOpen(false)}
        upgrades={game.upgradesManager.listUpgradesForUI()}
        onPurchaseUpgrade={handlePurchaseUpgrade}
      />
    </>
  );
};
