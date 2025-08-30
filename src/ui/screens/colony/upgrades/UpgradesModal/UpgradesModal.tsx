import React from 'react';
import { Modal } from '@ui/shared';
import { ResourceCost } from '@ui/shared/resources/ResourceCost';
import { EffectsSection } from '@ui/shared/resources/EffectsSection';
import { UpgradesModalProps } from '../upgrades.types';
import './UpgradesModal.css';



export const UpgradesModal: React.FC<UpgradesModalProps> = ({
  isOpen,
  onClose,
  upgrades,
  onPurchaseUpgrade
}) => {



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
                
                {upgrade.currentLevel < upgrade.maxLevel && upgrade.unlocked && upgrade.costCheck && (
                  <div className="upgrade-cost">
                    <h4>Next Level Cost:</h4>
                    <ResourceCost costCheck={upgrade.costCheck} showStatus={true} />
                  </div>
                )}
                
                {upgrade.bonusDetails && upgrade.bonusDetails.length > 0 ? (
                  <EffectsSection 
                    bonusDetails={upgrade.bonusDetails} 
                    title="Upgrade Effects"
                    compact={false}
                  />
                ) : null}
                
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
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};
