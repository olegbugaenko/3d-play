import React from 'react';
import { IconButton, IconButtonProps } from '../IconButton';
import './HorizontalMenu.css';

interface HorizontalMenuProps {
  buttons: (IconButtonProps & { id: string })[];
}

export const HorizontalMenu: React.FC<HorizontalMenuProps> = ({ buttons }) => {
  const visibleButtons = buttons.filter(button => button.visible !== false);
  
  return (
    <div className="horizontal-menu menu-bottom horizontal-flex box">
      {visibleButtons.map(button => (
        <IconButton key={button.id} {...button} />
      ))}
    </div>
  );
};
