import React, { useEffect, useRef } from 'react';

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
  console.log('[AreaSelectionSystem] Rendering with props:', { isActive, radius });
  
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    console.log('[AreaSelectionSystem] useEffect triggered, isActive:', isActive);
    
    if (!isActive) {
      console.log('[AreaSelectionSystem] Not active, returning');
      return;
    }
    
    if (!canvasRef.current) {
      console.log('[AreaSelectionSystem] No canvas ref, returning');
      return;
    }

    console.log('[AreaSelectionSystem] Setting up canvas and listeners');
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      console.log('[AreaSelectionSystem] No canvas context, returning');
      return;
    }

    // Встановлюємо розміри
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    console.log('[AreaSelectionSystem] Canvas size set to:', canvas.width, 'x', canvas.height);

    const handleMouseMove = (e: MouseEvent) => {
      console.log('[AreaSelectionSystem] Mouse move at:', e.clientX, e.clientY);
      
      // Очищаємо canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Малюємо червону сферу навколо мишки
      ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
      ctx.beginPath();
      ctx.arc(e.clientX, e.clientY, radius, 0, 2 * Math.PI);
      ctx.fill();
      
      console.log('[AreaSelectionSystem] Red sphere drawn at:', e.clientX, e.clientY, 'radius:', radius);
    };

    // Додаємо тільки mouse move listener
    console.log('[AreaSelectionSystem] Adding mouse move listener to window');
    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      console.log('[AreaSelectionSystem] Cleaning up mouse move listener');
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [isActive, radius, onConfirm, onCancel]);

  if (!isActive) {
    console.log('[AreaSelectionSystem] Not active, returning null');
    return null;
  }

  console.log('[AreaSelectionSystem] Rendering canvas');
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
