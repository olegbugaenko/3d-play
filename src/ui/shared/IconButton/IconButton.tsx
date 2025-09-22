import React from 'react';
import './IconButton.css';

export interface IconButtonProps {
  iconId: string;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
  title?: string;
}

export const IconButton: React.FC<IconButtonProps> = ({
  iconId,
  onClick,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  className = '',
  type = 'button',
  title
}) => {
  const buttonClasses = [
    'icon-btn',
    `icon-btn-${variant}`,
    `icon-btn-${size}`,
    className
  ].filter(Boolean).join(' ');

  // Формуємо шлях до іконки
  const iconPath = `/icons/${iconId}`;

  return (
    <button
      type={type}
      className={buttonClasses}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      <img 
        src={iconPath} 
        alt={iconId}
        className="icon-btn-image"
        onError={(e) => {
          // Fallback якщо іконка не знайдена
          const target = e.target as HTMLImageElement;
          target.style.display = 'none';
          target.parentElement!.innerHTML = `<span class="icon-fallback">${iconId}</span>`;
        }}
      />
    </button>
  );
};
