import React from 'react';
import { Modal } from '@ui/shared/Modal';
import './BuildingsModal.css';

interface BuildingItem {
  typeId: string;
  name: string;
  description: string;
  currentCount: number;
  maxQuantity?: number;
  canBuild: boolean;
  cost: Record<string, number>;
  effects: string[];
}

interface BuildingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  buildings: BuildingItem[];
  onSelectBuilding: (typeId: string) => void;
}

export const BuildingsModal: React.FC<BuildingsModalProps> = ({
  isOpen,
  onClose,
  buildings,
  onSelectBuilding
}) => {

  const getResourceColor = (resourceId: string) => {
    const colors: Record<string, string> = {
      stone: '#8B4513',
      ore: '#696969',
      energy: '#32CD32'
    };
    return colors[resourceId] || '#333';
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Buildings" size="large">
      <div className="buildings-container">
        {buildings.length === 0 ? (
          <div className="no-buildings">
            <p>No buildings available yet.</p>
          </div>
        ) : (
          <div className="buildings-grid">
            {buildings.map((building) => (
              <div key={building.typeId} className="building-card">
                <div className="building-header">
                  <h3 className="building-name">{building.name}</h3>
                  <div className="building-count">
                    {building.maxQuantity ? 
                      `${building.currentCount}/${building.maxQuantity}` : 
                      `${building.currentCount}`
                    }
                  </div>
                </div>
                
                <p className="building-description">{building.description}</p>
                
                <div className="building-cost">
                  <h4>Construction Cost:</h4>
                  <div className="cost-items">
                    {Object.entries(building.cost).map(([resourceId, amount]) => (
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

                {building.effects.length > 0 && (
                  <div className="building-effects">
                    <h4>Effects:</h4>
                    <ul className="effects-list">
                      {building.effects.map((effect, index) => (
                        <li key={index} className="effect-item">{effect}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                <div className="building-actions">
                  {building.maxQuantity && building.currentCount >= building.maxQuantity ? (
                    <div className="max-quantity-badge">Max Quantity Reached</div>
                  ) : !building.canBuild ? (
                    <div className="locked-badge">Locked</div>
                  ) : (
                    <button
                      className="build-button"
                      onClick={() => onSelectBuilding(building.typeId)}
                    >
                      Build
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
