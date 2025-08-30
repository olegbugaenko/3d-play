import React from 'react';
import { ResourceCheckResult } from '@logic/modules/resources/resource-types';
import { formatNumber } from '@utils/formatters';
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

  const getResourceIcon = (status: any): string => {
    // Використовуємо іконку з БД, якщо є, інакше fallback
    return status.icon || '📦';
  };



  return (
    <div className={`resource-cost ${compact ? 'compact' : ''}`}>
      <div className="cost-items">
                 {Object.entries(costCheck.resources).map(([resourceId, status]) => {
           const { required, own, isAffordable } = status;
           const color = getResourceColor(status);
           const icon = getResourceIcon(status);
          
          return (
            <div 
              key={resourceId} 
              className={`cost-item ${isAffordable ? 'affordable' : 'unaffordable'}`}
            >
              <span className="cost-icon" style={{ color }}>
                {icon}
              </span>
              
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
