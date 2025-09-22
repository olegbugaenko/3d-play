import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { CommandGroup } from '@systems/commands';
import { Game } from '@core/game/game';
import { CameraController } from '@ui/screens/colony/scene/CameraController';
import { HorizontalMenu, IconButton } from '@ui/shared';

interface CommandPanelProps {
  selectedUnits: string[];
  onCommandChange: (commandGroup: CommandGroup | null) => void;
  game: Game;
  cameraController: CameraController;
  activeCommand?: CommandGroup | null;
}

export const CommandPanel: React.FC<CommandPanelProps> = React.memo(({ selectedUnits, onCommandChange, game, cameraController, activeCommand = null }) => {
  
  const [selectedScope, setSelectedScope] = useState<'gather' | 'build' | null>(null);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [selectedCommand, setSelectedCommand] = useState<CommandGroup | null>(activeCommand);
  const [isCameraPinned, setIsCameraPinned] = useState(false);

  useEffect(() => {
    setSelectedCommand(activeCommand ?? null);
  }, [activeCommand]);

  // Перевіряємо чи відкрито будівництво
  const isBuildingConstructionsUnlocked = game.upgradesManager.isUnlocked('building_constructions');
  const buildingConstructionsState = game.upgradesManager.getUpgradeState('building_constructions');
  const isBuildingConstructionsPurchased = (buildingConstructionsState?.level ?? 0) > 0;
  const isBuildingAvailable = isBuildingConstructionsUnlocked && isBuildingConstructionsPurchased;

  // Функція для отримання іконки ресурсу
  const getResourceIcon = (resourceType: string): string => {
    switch (resourceType) {
      case 'stone': return 'resources/stone.svg';
      case 'ore': return 'resources/ore.svg';
      case 'biomass': return 'resources/biomass.svg';
      case 'energy': return 'resources/energy.svg';
      default: return 'interface/gather.png';
    }
  };
  

  // Мемоізація: Обчислюємо тільки коли змінилася кількість юнітів
  const selectedUnitsCount = selectedUnits.length;
  
  const memoizedScopes = useMemo(() => {
    if (selectedUnitsCount === 0) return [];
    console.log('isBuildingAvailable', isBuildingAvailable);
    const scopes = ['gather'];
    // Додаємо build тільки якщо будівництво доступне
    if (isBuildingAvailable) {
      scopes.push('build');
    }
    
    return scopes.filter(scope => {
      const groups = game.commandGroupSystem.getAvailableGroupsByScope(scope as 'gather' | 'build');
      return groups.length > 0;
    });
  }, [selectedUnitsCount, game.commandGroupSystem, isBuildingAvailable]);
  
  // Отримуємо доступні scope для вибраних юнітів
  useEffect(() => {
    if (selectedUnitsCount === 0) {
      setSelectedScope(null);
      setSelectedCommand(null);
      onCommandChange(null);
      return;
    }
    
    // Якщо немає доступних scope, скидаємо вибір
    if (memoizedScopes.length === 0) {
      setSelectedScope(null);
      setSelectedCommand(null);
      onCommandChange(null);
    }
  }, [selectedUnitsCount, memoizedScopes, onCommandChange]);

  // Отримуємо доступні категорії для обраного scope
  useEffect(() => {
    if (!selectedScope) {
      setAvailableCategories([]);
      return;
    }

    const groups = game.commandGroupSystem.getAvailableGroupsByScope(selectedScope);
    
    // Отримуємо унікальні категорії з UI метаданих
    const categories = [...new Set(groups.map(group => group.ui?.category).filter(Boolean))] as string[];
    setAvailableCategories(categories);
  }, [selectedScope, game.commandGroupSystem]);
  
  // Оновлюємо швидкість інтерполяції в контролері камери
  useEffect(() => {
    cameraController.setInterpolationSpeed(0.1);
  }, [cameraController]);

  // Обробник кліку по scope
  const handleScopeClick = useCallback((scope: 'gather' | 'build') => {
    const newScope = selectedScope === scope ? null : scope;
    setSelectedScope(newScope);
    setSelectedCommand(null);
    onCommandChange(null);
  }, [selectedScope, onCommandChange]);

  // Обробник кліку по команді
  const handleCommandClick = useCallback((commandGroup: CommandGroup) => {
    setSelectedCommand(commandGroup);
    onCommandChange(commandGroup);
  }, [onCommandChange]);

  // Якщо немає вибраних юнітів, не показуємо панель
  if (selectedUnits.length === 0) {
    return null;
  }

  // Створюємо кнопки для основного меню
  const mainMenuButtons = [
    {
      id: 'gather',
      iconId: 'interface/gather.png',
      variant: selectedScope === 'gather' ? 'success' : 'primary' as const,
      onClick: () => handleScopeClick('gather'),
      title: 'Gather Resources',
      visible: true
    },
    {
      id: 'build',
      iconId: 'build.svg',
      variant: selectedScope === 'build' ? 'success' : 'primary' as const,
      onClick: () => handleScopeClick('build'),
      title: 'Build Structures',
      visible: isBuildingAvailable
    },
    {
      id: 'pin-camera',
      iconId: isCameraPinned ? 'unpin-camera.svg' : 'pin-camera.svg',
      variant: isCameraPinned ? 'success' : 'primary' as const,
      onClick: () => {
        if (isCameraPinned) {
          cameraController.unpin();
          setIsCameraPinned(false);
        } else if (selectedUnits.length === 1) {
          cameraController.pinToObject(selectedUnits[0]);
          setIsCameraPinned(true);
        }
      },
      title: isCameraPinned ? 'Unpin Camera' : 'Pin Camera',
      visible: selectedUnits.length === 1,
      disabled: selectedUnits.length !== 1
    }
  ];

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9999,
      pointerEvents: 'auto'
    }}>

      {/* Інформація про вибрані юніти */}
      <div style={{ 
        textAlign: 'center', 
        fontSize: '11px', 
        opacity: 0.6,
        color: 'white',
        marginTop: '8px'
      }}>
        {selectedUnits.length} unit{selectedUnits.length !== 1 ? 's' : ''} selected
        {selectedCommand && (
          <div style={{ marginTop: '5px' }}>
            Selected: {selectedCommand.ui?.name || selectedCommand.name}
          </div>
        )}
      </div>
      {/* Підменю для вибору ресурсів/команд */}
      {selectedScope && (
        <div className="box menu-second-row" style={{ marginBottom: '8px' }}>
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {availableCategories.map(category => {
              const groups = game.commandGroupSystem.getAvailableGroupsByScopeAndCategory(selectedScope, category);
              return groups.map(group => {
                // Визначаємо тип ресурсу з назви команди
                const resourceType = group.ui?.name?.toLowerCase().includes('stone') ? 'stone' :
                                   group.ui?.name?.toLowerCase().includes('ore') ? 'ore' :
                                   group.ui?.name?.toLowerCase().includes('biomass') ? 'biomass' :
                                   group.ui?.name?.toLowerCase().includes('energy') ? 'energy' : 'gather';
                
                return (
                  <IconButton
                    key={group.id}
                    iconId={getResourceIcon(resourceType)}
                    variant={selectedCommand?.id === group.id ? 'success' : 'primary'}
                    onClick={() => handleCommandClick(group)}
                    title={group.ui?.description || group.ui?.name || group.name}
                  />
                );
              });
            })}
          </div>
        </div>
      )}

      {/* Основне меню команд */}
      <div className="" style={{ marginBottom: '8px' }}>
        <HorizontalMenu buttons={mainMenuButtons} />
      </div>




    </div>
  );
});
