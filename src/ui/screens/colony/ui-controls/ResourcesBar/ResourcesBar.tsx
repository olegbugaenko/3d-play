import React, { useState, useEffect, useRef } from 'react';
import { ResourceId } from '@resources/index';
import { ResourceManager } from '@logic/modules/resources/ResourceManager';
import { formatNumber } from '@logic/utils/formatters';
import './ResourcesBar.css';

interface UIResourceData {
  id: ResourceId;
  name: string;
  icon?: string;
  color?: string;
  description?: string;
  current: number;
  max: number;
  progress: number;
  income: number;
  consumption: number;
}

interface ResourcesBarProps {
  resourceManager: ResourceManager;
}

export const ResourcesBar: React.FC<ResourcesBarProps> = ({ resourceManager }) => {
  const [resources, setResources] = useState<UIResourceData[]>([]);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    // Оновлюємо ресурси кожні 200мс
    const updateResources = () => {
      const availableResources = resourceManager.getAvailableResourcesForUI();
      setResources(availableResources);
    };

    // Початкове оновлення
    updateResources();

    // Встановлюємо інтервал
    intervalRef.current = setInterval(updateResources, 400);

    // Cleanup при розмонтуванні
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [resourceManager]);



  return (
    <div className="resources-bar">
      <div className="resources-container">
        {resources.map((resource) => {
          const { id, name, icon, color, current, max, progress } = resource;
          
          return (
            <div key={id} className="resource-item">
              <div className="resource-icon" style={{ color: color }}>
                {icon}
              </div>
              
              <div className="resource-info">
                <div className="resource-name">{name}</div>
                <div className="resource-amount">
                  {formatNumber(current)} / {formatNumber(max)}
                </div>
              </div>
              
              <div className="resource-progress">
                <div 
                  className="progress-bar"
                  style={{ 
                    width: `${progress}%`,
                    backgroundColor: color 
                  }}
                />
              </div>
            </div>
          );
        })}
             </div>
     </div>
   );
 };
