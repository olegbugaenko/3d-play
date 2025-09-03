import React from 'react';
import { Modal } from '@ui/shared';
import { ResourceCost } from '@ui/shared/resources/ResourceCost';
import { EffectsSection } from '@ui/shared/resources/EffectsSection';
import './BuildingsModal.css';

interface BuildingItem {
  typeId: string;
  name: string;
  description: string;
  currentCount: number;
  maxQuantity?: number;
  canBuild: boolean;
  costCheck: any; // ResourceCheckResult
  bonusDetails: any[]; // BonusDetail[]
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

  const handleBuildingSelect = (typeId: string) => {
    onSelectBuilding(typeId);
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
              <div 
                key={building.typeId} 
                className={`building-card ${building.canBuild ? 'can-build' : 'cannot-build'}`}
                onClick={() => building.canBuild && handleBuildingSelect(building.typeId)}
              >
                <div className="building-header">
                  <h3 className="building-name">{building.name}</h3>
                  <div className="building-count">
                    {building.currentCount}
                    {building.maxQuantity && `/${building.maxQuantity}`}
                  </div>
                </div>
                
                <p className="building-description">{building.description}</p>
                
                {building.costCheck && (
                  <div className="building-cost">
                    <h4>Construction Cost:</h4>
                    <ResourceCost costCheck={building.costCheck} showStatus={true} />
                  </div>
                )}
                
                {building.bonusDetails && building.bonusDetails.length > 0 ? (
                  <EffectsSection 
                    bonusDetails={building.bonusDetails} 
                    title="Building Effects"
                    compact={false}
                  />
                ) : null}
                
                <div className="building-status">
                  {building.canBuild ? (
                    <button className="build-button">
                      Select for Construction
                    </button>
                  ) : (
                    <div className="cannot-build-badge">
                      Cannot Build
                    </div>
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
