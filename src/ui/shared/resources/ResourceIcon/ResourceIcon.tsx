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
  const getSVGIcon = (id: string, iconColor: string): string => {
    switch (id) {
      case 'energy':
        return `
          <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="${iconColor}" stroke="${iconColor}" stroke-width="1" stroke-linejoin="round"/>
          </svg>
        `;
      case 'stone':
        return `
          <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 3h18v18H3z" fill="${iconColor}" stroke="#000" stroke-width="1"/>
            <path d="M3 3l18 0l0 18l-18 0z" fill="none" stroke="#000" stroke-width="1"/>
            <path d="M3 3l9 9l9 -9" fill="none" stroke="#000" stroke-width="1"/>
            <path d="M12 12l9 9l-9 -9" fill="none" stroke="#000" stroke-width="1"/>
          </svg>
        `;
      case 'ore':
        return `
          <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2l4 6h4l-2 8-6 6-6-6-2-8h4l4-6z" fill="${iconColor}" stroke="#000" stroke-width="1" stroke-linejoin="round"/>
            <path d="M12 2l-4 6l4 4l4-4l-4-6z" fill="none" stroke="#000" stroke-width="1"/>
            <path d="M8 8l4 4l4-4" fill="none" stroke="#000" stroke-width="1"/>
          </svg>
        `;
      default:
        // Fallback - простий квадрат
        return `
          <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="3" width="18" height="18" fill="${iconColor}" stroke="#000" stroke-width="1"/>
          </svg>
        `;
    }
  };

  const svgString = getSVGIcon(resourceId, color || '#FFFFFF');
  
  return (
    <span 
      className={`resource-icon ${className}`}
      dangerouslySetInnerHTML={{ __html: svgString }}
      style={{ 
        display: 'inline-block',
        width: size,
        height: size,
        verticalAlign: 'middle'
      }}
    />
  );
};
