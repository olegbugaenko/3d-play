import React from 'react';
import { Modal } from './Modal';
import './UpgradesModal.css';

interface UpgradeItem {
  typeId: string;
  name: string;
  description: string;
  currentLevel: number;
  maxLevel: number;
  unlocked: boolean;
  canUpgrade: boolean;
  nextLevelCost: Record<string, number>;
  canAfford: boolean;
  costCheck: any;
}

interface UpgradesModalProps {
  isOpen: boolean;
  onClose: () => void;
  upgrades: UpgradeItem[];
  onPurchaseUpgrade: (typeId: string) => void;
}

export const UpgradesModal: React.FC<UpgradesModalProps> = ({
  isOpen,
  onClose,
  upgrades,
  onPurchaseUpgrade
}) => {
  const formatResourceCost = (cost: Record<string, number>) => {
    return Object.entries(cost)
      .map(([resource, amount]) => `${resource}: ${amount}`)
      .join(', ');
  };

  const getResourceColor = (resourceId: string) => {
    const colors: Record<string, string> = {
      stone: '#8B4513',
      ore: '#696969',
      energy: '#32CD32'
    };
    return colors[resourceId] || '#333';
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Upgrades" size="large">
      <div className="upgrades-container">
        {upgrades.length === 0 ? (
          <div className="no-upgrades">
            <p>No upgrades available yet.</p>
          </div>
        ) : (
          <div className="upgrades-grid">
            {upgrades.map((upgrade) => (
              <div key={upgrade.typeId} className="upgrade-card">
                <div className="upgrade-header">
                  <h3 className="upgrade-name">{upgrade.name}</h3>
                  <div className="upgrade-level">
                    Level {upgrade.currentLevel}/{upgrade.maxLevel}
                  </div>
                </div>
                
                <p className="upgrade-description">{upgrade.description}</p>
                
                {upgrade.currentLevel < upgrade.maxLevel && upgrade.unlocked && (
                  <div className="upgrade-cost">
                    <h4>Next Level Cost:</h4>
                    <div className="cost-items">
                      {Object.entries(upgrade.nextLevelCost).map(([resourceId, amount]) => (
                        <span 
                          key={resourceId} 
                          className="cost-item"
                          style={{ color: getResourceColor(resourceId) }}
                        >
                          {resourceId}: {amount}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="upgrade-actions">
                  {upgrade.currentLevel >= upgrade.maxLevel ? (
                    <div className="max-level-badge">Max Level Reached</div>
                  ) : !upgrade.unlocked ? (
                    <div className="locked-badge">Locked</div>
                  ) : (
                    <button
                      className={`purchase-button ${!upgrade.canAfford ? 'disabled' : ''}`}
                      onClick={() => onPurchaseUpgrade(upgrade.typeId)}
                      disabled={!upgrade.canAfford}
                    >
                      {upgrade.canAfford ? 'Upgrade' : 'Not Enough Resources'}
                    </button>
                  )}
                </div>
                
                {!upgrade.canAfford && upgrade.currentLevel < upgrade.maxLevel && upgrade.unlocked && (
                  <div className="missing-resources">
                    <h4>Missing Resources:</h4>
                    <div className="missing-items">
                      {Object.entries(upgrade.costCheck.missing).map(([resourceId, amount]) => (
                        <span 
                          key={resourceId} 
                          className="missing-item"
                          style={{ color: getResourceColor(resourceId) }}
                        >
                          {resourceId}: {amount}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};
