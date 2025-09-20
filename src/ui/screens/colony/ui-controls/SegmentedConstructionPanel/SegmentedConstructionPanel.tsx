import React, { useState, useEffect } from 'react';
import { IconButton } from '@ui/shared';
import { useInteractionContext } from '@ui/screens/colony/scene/context/InteractionContext';

export const SegmentedConstructionPanel: React.FC = () => {
  const interactionManager = useInteractionContext();
  
  // ВИПРАВЛЕНО: force re-render для оновлення стану
  const [, forceUpdate] = useState({});
  
  useEffect(() => {
    const interval = setInterval(() => {
      forceUpdate({});
    }, 500); // оновлюємо кожні 100мс
    
    return () => clearInterval(interval);
  }, []);
  
  // Отримуємо стан будівництва від BuildingHandler
  const buildingState = interactionManager?.getBuildingState?.() || { 
    isInBuildingMode: false, 
    selectedBuilding: null 
  };

  // Отримуємо стан сегментованого будівництва
  const segmentedState = interactionManager?.getSegmentedState?.() || {
    isSegmentedMode: false,
    segmentedPath: [],
    canConfirm: false
  };

  // Показуємо панель тільки якщо ми в режимі сегментованого будівництва
  if (!buildingState.isInBuildingMode || !segmentedState.isSegmentedMode) {
    return null;
  }

  const segmentsCount = Math.max(0, segmentedState.segmentedPath.length - 1);
  const constructionTypeName = buildingState.selectedBuilding?.name || 'Construction';

  const handleConfirm = () => {
    if (interactionManager?.finishSegmentedBuilding) {
      interactionManager.finishSegmentedBuilding();
    }
  };

  const handleCancel = () => {
    if (interactionManager?.cancelSegmentedBuilding) {
      interactionManager.cancelSegmentedBuilding();
    }
  };

  const buttons = [
    {
      id: 'confirm-segmented',
      iconId: 'interface/build.png', // галочка
      variant: segmentedState.canConfirm ? 'success' : 'secondary' as const,
      onClick: handleConfirm,
      title: `Confirm ${constructionTypeName}`,
      disabled: !segmentedState.canConfirm
    },
    {
      id: 'cancel-segmented',
      iconId: 'interface/gather.png', // хрестик  
      variant: 'danger' as const,
      onClick: handleCancel,
      title: 'Cancel Construction'
    }
  ];

  return (
    <div style={{
      position: 'fixed',
      bottom: '80px', // над CommandPanel
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9999,
      pointerEvents: 'auto'
    }}>
      {/* Інформація про будівництво */}
      <div style={{ 
        textAlign: 'center', 
        fontSize: '11px', 
        opacity: 0.8,
        color: 'white',
        marginBottom: '8px',
        padding: '4px 8px',
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        borderRadius: '4px'
      }}>
        {constructionTypeName}: {segmentsCount} segment{segmentsCount !== 1 ? 's' : ''}
        {!segmentedState.canConfirm && segmentsCount > 0 && (
          <div style={{ color: '#ff6b6b', marginTop: '2px' }}>
            Invalid segments detected
          </div>
        )}
      </div>

      {/* Кнопки підтвердження/скасування */}
      <div className='horizontal-menu menu-bottom horizontal-flex box'>
        {buttons.map(button => (
          <IconButton
            key={button.id}
            iconId={button.iconId}
            variant={button.variant}
            onClick={button.onClick}
            title={button.title}
            disabled={button.disabled}
          />
        ))}
      </div>
    </div>
  );
};
