import React from 'react';
import { IconButton } from '../IconButton';
import './VerticalMenu.css';

interface MenuButton {
  id: string;
  iconId: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';
  onClick: () => void;
  title?: string;
  disabled?: boolean;
  visible?: boolean;
}

interface VerticalMenuProps {
  buttons: MenuButton[];
  className?: string;
}

export const VerticalMenu: React.FC<VerticalMenuProps> = ({ buttons, className = '' }) => {
  const visibleButtons = buttons.filter(button => button.visible !== false);

  return (
    <div className={`box menu vertical-flex vertical-menu ${className}`}>
      {visibleButtons.map((button) => (
        <IconButton
          key={button.id}
          iconId={button.iconId}
          variant={button.variant || 'primary'}
          onClick={button.onClick}
          disabled={button.disabled}
          title={button.title}
          className="vertical-menu-button"
        />
      ))}
    </div>
  );
};
