import React from 'react';
import { BonusDetail } from '@logic/systems/modifiers-system/bonus-system.types';
import { formatNumber, formatMultiplier } from '@utils/formatters';
import './EffectsSection.css';

interface EffectsSectionProps {
  bonusDetails: BonusDetail[];
  title?: string;
  compact?: boolean;
}

export const EffectsSection: React.FC<EffectsSectionProps> = ({ 
  bonusDetails, 
  title = "Effects & Bonuses",
  compact = false 
}) => {



  const getEffectTypeIcon = (type: 'effect' | 'resource'): string => {
    return type === 'effect' ? '⚡' : '📦';
  };

  if (bonusDetails.length === 0) {
    return null;
  }

  return (
    <div className={`effects-section ${compact ? 'compact' : ''}`}>
      <h4 className="effects-title">{title}</h4>
      
      <div className="effects-table">
        <div className="effects-header">
          <div className="effect-name">Name</div>
          <div className="effect-bonus">Bonus</div>
          <div className="effect-next">Next</div>
        </div>
        
        {bonusDetails.map((detail) => (
          <div key={`${detail.id}-${detail.bonusType}`} className="effect-row">
            <div className="effect-name">
              <span className="effect-icon">
                {getEffectTypeIcon(detail.type)}
              </span>
              {detail.name}
              {(detail.bonusType === 'cap' || detail.bonusType === 'capMulti') && ' max'}
            </div>
            
            <div className="effect-bonus">
              {detail.bonusType === 'multiplier' || detail.bonusType === 'capMulti' 
                ? formatMultiplier(detail.currentLevelValue)
                : formatNumber(detail.currentLevelValue)
              }
            </div>
            
            <div className="effect-next">
              {detail.bonusType === 'multiplier' || detail.bonusType === 'capMulti' 
                ? formatMultiplier(detail.nextLevelValue)
                : formatNumber(detail.nextLevelValue)
              }
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
