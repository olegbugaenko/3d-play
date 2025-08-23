import React, { useState, useEffect, useRef } from 'react';
import { RESOURCES_DB, ResourceId } from '../../logic/resources';

interface ResourceData {
  current: number;
  max: number;
  progress: number;
}

interface ResourcesBarProps {
  getAvailableResources: () => Record<string, ResourceData>;
}

export const ResourcesBar: React.FC<ResourcesBarProps> = ({ getAvailableResources }) => {
  const [resources, setResources] = useState<Record<string, ResourceData>>({});
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Оновлюємо ресурси кожні 200мс
    const updateResources = () => {
      const availableResources = getAvailableResources();
      setResources(availableResources);
    };

    // Початкове оновлення
    updateResources();

    // Встановлюємо інтервал
    intervalRef.current = setInterval(updateResources, 200);

    // Cleanup при розмонтуванні
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [getAvailableResources]);

  const formatNumber = (num: number): string => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  };

  return (
    <div className="resources-bar">
      <div className="resources-container">
        {Object.entries(RESOURCES_DB).map(([id, resourceDef]) => {
          const resourceData = resources[id];
          if (!resourceData) return null;

          const { current, max, progress } = resourceData;
          const resourceId = id as ResourceId;
          
          return (
            <div key={resourceId} className="resource-item">
              <div className="resource-icon" style={{ color: resourceDef.color }}>
                {resourceDef.icon}
              </div>
              
              <div className="resource-info">
                <div className="resource-name">{resourceDef.name}</div>
                <div className="resource-amount">
                  {formatNumber(current)} / {formatNumber(max)}
                </div>
              </div>
              
              <div className="resource-progress">
                <div 
                  className="progress-bar"
                  style={{ 
                    width: `${progress * 100}%`,
                    backgroundColor: resourceDef.color 
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      
      <style jsx>{`
        .resources-bar {
          position: fixed;
          top: 20px;
          left: 120px;
          z-index: 1000;
          background: rgba(0, 0, 0, 0.8);
          border-radius: 12px;
          padding: 16px;
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }

        .resources-container {
          display: flex;
          gap: 12px;
        }

        .resource-item {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 200px;
        }

        .resource-icon {
          font-size: 24px;
          width: 32px;
          text-align: center;
        }

        .resource-info {
          flex: 1;
          min-width: 0;
        }

        .resource-name {
          color: #ffffff;
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 2px;
        }

        .resource-amount {
          color: #cccccc;
          font-size: 12px;
          font-family: 'Courier New', monospace;
        }

        .resource-progress {
          width: 60px;
          height: 6px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 3px;
          overflow: hidden;
        }

        .progress-bar {
          height: 100%;
          border-radius: 3px;
          transition: width 0.2s ease-out;
        }
      `}</style>
    </div>
  );
};
