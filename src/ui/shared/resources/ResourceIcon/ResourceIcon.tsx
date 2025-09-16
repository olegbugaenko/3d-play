import React from 'react';
import { ResourceId } from '@logic/modules/resources/resources-db';

interface ResourceIconProps {
  resourceId: ResourceId | string;
  color?: string;
  size?: number;
  className?: string;
}

export const ResourceIcon: React.FC<ResourceIconProps> = ({ 
  resourceId, 
  color, 
  size = 24, 
  className = '' 
}) => {
  const iconPath = `/icons/resources/${resourceId}.svg`;
  
  return (
    <img 
      src={iconPath}
      alt={resourceId}
      className={`resource-icon ${className}`}
      style={{ 
        width: size, 
        height: size, 
        display: 'inline-block',
        verticalAlign: 'middle',
        filter: color ? `brightness(0) saturate(100%) ${color}` : 'none'
      }}
      onError={(e) => {
        // Fallback до старого SVG якщо файл не знайдено
        const target = e.target as HTMLImageElement;
        target.style.display = 'none';
        const fallbackDiv = document.createElement('div');
        fallbackDiv.innerHTML = `
          <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="3" width="18" height="18" fill="${color || '#666'}" stroke="#000" stroke-width="1"/>
          </svg>
        `;
        target.parentNode?.appendChild(fallbackDiv);
      }}
    />
  );
};
