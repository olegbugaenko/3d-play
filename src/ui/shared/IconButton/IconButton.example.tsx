import React from 'react';
import { IconButton } from './IconButton';

/**
 * Приклад використання IconButton компонента
 * Цей файл можна видалити після тестування
 */
export const IconButtonExample: React.FC = () => {
  return (
    <div style={{ 
      display: 'flex', 
      gap: '16px', 
      padding: '20px',
      backgroundColor: '#f8f9fa',
      borderRadius: '8px',
      margin: '20px'
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
        <span>Small</span>
        <IconButton iconId="menu.svg" size="small" variant="primary" />
        <IconButton iconId="save.svg" size="small" variant="success" />
        <IconButton iconId="upgrade.svg" size="small" variant="ghost" />
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
        <span>Medium</span>
        <IconButton iconId="menu.svg" size="medium" variant="primary" />
        <IconButton iconId="save.svg" size="medium" variant="success" />
        <IconButton iconId="upgrade.svg" size="medium" variant="ghost" />
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
        <span>Large</span>
        <IconButton iconId="menu.svg" size="large" variant="primary" />
        <IconButton iconId="save.svg" size="large" variant="success" />
        <IconButton iconId="upgrade.svg" size="large" variant="ghost" />
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
        <span>Menu Size</span>
        <IconButton iconId="menu.svg" className="icon-btn-menu" variant="primary" />
        <IconButton iconId="save.svg" className="icon-btn-menu" variant="success" />
        <IconButton iconId="upgrade.svg" className="icon-btn-menu" variant="ghost" />
      </div>
    </div>
  );
};
