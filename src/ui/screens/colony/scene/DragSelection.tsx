import React, { useState, useEffect } from 'react';
import { useInteractionContext } from './context/InteractionContext';

interface DragSelectionProps {
  // No props needed - component is self-contained
}

export const DragSelection: React.FC<DragSelectionProps> = () => {
  const interactionManager = useInteractionContext();
  const [dragCoords, setDragCoords] = useState<{start: {x: number, y: number}, end: {x: number, y: number}} | null>(null);

  // Підписуємося на події drag selection від InteractionManager
  useEffect(() => {
    if (!interactionManager) return;

    const handleDragStart = (coords: {start: {x: number, y: number}, end: {x: number, y: number}}) => {
      setDragCoords(coords);
    };

    const handleDragEnd = () => {
      setDragCoords(null);
    };

    interactionManager.on('dragStart', handleDragStart);
    interactionManager.on('dragEnd', handleDragEnd);

    return () => {
      interactionManager.off('dragStart', handleDragStart);
      interactionManager.off('dragEnd', handleDragEnd);
    };
  }, [interactionManager]);

  if (!dragCoords) return null;

  return (
    <div
      style={{
        position: 'fixed', // Змінюємо на fixed щоб було поверх всього
        left: Math.min(dragCoords.start.x, dragCoords.end.x),
        top: Math.min(dragCoords.start.y, dragCoords.end.y),
        width: Math.abs(dragCoords.end.x - dragCoords.start.x),
        height: Math.abs(dragCoords.end.y - dragCoords.start.y),
        border: '2px solid #00ff00',
        backgroundColor: 'rgba(0, 255, 0, 0.1)',
        pointerEvents: 'none',
        zIndex: 9999 // Високий z-index щоб було поверх всього
      }}
    />
  );
};
