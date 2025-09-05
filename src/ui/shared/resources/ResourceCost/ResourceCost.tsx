import React from 'react';
import { ResourceCheckResult } from '@logic/modules/resources/resource-types';
import { formatNumber } from '@utils/formatters';
import { ResourceIcon } from '@ui/shared/resources/ResourceIcon/ResourceIcon';
import './ResourceCost.css';

interface ResourceCostProps {
  costCheck: ResourceCheckResult;
  showStatus?: boolean; // Чи показувати статус (доступно/недоступно)
  compact?: boolean; // Компактний режим для маленьких елементів
}

export const ResourceCost: React.FC<ResourceCostProps> = ({ 
  costCheck, 
  showStatus = true, 
  compact = false 
}) => {
  const getResourceColor = (status: any): string => {
    // Використовуємо колір з БД, якщо є, інакше fallback
    return status.color || '#ffffff';
  };

  // Видаляємо старий метод getResourceIcon, тепер використовуємо ResourceIcon компонент



  return (
    <div className={`resource-cost ${compact ? 'compact' : ''}`}>
      <div className="cost-items">
                 {Object.entries(costCheck.resources).map(([resourceId, status]) => {
           const { required, own, isAffordable } = status;
           const color = getResourceColor(status);
          
          return (
            <div 
              key={resourceId} 
              className={`cost-item ${isAffordable ? 'affordable' : 'unaffordable'}`}
            >
              <ResourceIcon 
                resourceId={resourceId} 
                color={color} 
                size={compact ? 16 : 20}
                className="cost-icon"
              />
              
              <span className="cost-amount">
                {formatNumber(own)} / {formatNumber(required)}
              </span>
              
              {showStatus && (
                <span className="cost-status">
                  {isAffordable ? '✓' : '✗'}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
