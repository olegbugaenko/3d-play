import React, { useRef, useEffect } from 'react';

interface AreaSelectionSystemProps {
  isActive: boolean;
  radius: number;
  onConfirm: (position: { x: number; y: number; z: number }) => void;
  onCancel: () => void;
}

export const AreaSelectionSystem: React.FC<AreaSelectionSystemProps> = ({
  isActive,
  radius,
  onConfirm,
  onCancel
}) => {
  
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!isActive) {
      return;
    }
    
    if (!canvasRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      return;
    }

    // Встановлюємо розміри
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const handleMouseMove = (e: MouseEvent) => {
      // Очищаємо canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Малюємо червону сферу навколо мишки
      ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
      ctx.beginPath();
      ctx.arc(e.clientX, e.clientY, radius, 0, 2 * Math.PI);
      ctx.fill();
    };

    const handleClick = (e: MouseEvent) => {
      if (e.button === 0) { // Ліва кнопка - підтверджуємо
        onConfirm({ x: e.clientX, y: e.clientY, z: 0 });
      } else if (e.button === 2) { // Права кнопка - скасовуємо
        e.preventDefault();
        onCancel();
      }
    };

    // Додаємо mouse move та click listeners
    window.addEventListener('mousemove', handleMouseMove);
    // window.addEventListener('mousedown', handleClick);
    window.addEventListener('contextmenu', (e) => e.preventDefault()); // Вимікаємо контекстне меню

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleClick);
    };
  }, [isActive, radius, onConfirm, onCancel]);

  if (!isActive) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 9998
      }}
    />
  );
};
