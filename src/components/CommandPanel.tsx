import React, { useState, useEffect, useCallback } from 'react';
import { getGroupsByScope, getGroupsByScopeAndCategory, CommandGroup } from '../../logic/commands';
import { AreaSelectionSystem } from './AreaSelectionSystem';

interface CommandPanelProps {
  selectedUnits: string[];
  onCommandSelect: (commandGroup: CommandGroup, centerPosition: { x: number; y: number; z: number }) => void;
  onAreaSelectionModeChange: (mode: { isActive: boolean; commandGroup: CommandGroup | null; radius: number }) => void;
}

export const CommandPanel: React.FC<CommandPanelProps> = ({ selectedUnits, onCommandSelect, onAreaSelectionModeChange }) => {
  console.log('[CommandPanel] Rendering with selectedUnits:', selectedUnits);
  
  const [selectedScope, setSelectedScope] = useState<'gather' | 'build' | null>(null);
  const [availableScopes, setAvailableScopes] = useState<string[]>([]);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [areaSelectionMode, setAreaSelectionMode] = useState<{
    isActive: boolean;
    commandGroup: CommandGroup | null;
    radius: number;
  }>({
    isActive: false,
    commandGroup: null,
    radius: 50
  });

  // Логуємо зміни в areaSelectionMode та передаємо в батьківський компонент
  useEffect(() => {
    console.log('[CommandPanel] areaSelectionMode changed:', areaSelectionMode);
    console.log('[CommandPanel] isActive value:', areaSelectionMode.isActive);
    onAreaSelectionModeChange(areaSelectionMode);
  }, [areaSelectionMode, onAreaSelectionModeChange]);


  // Мемоізуємо функції, щоб вони не створювалися заново
  const memoizedGetGroupsByScope = useCallback(getGroupsByScope, []);
  const memoizedGetGroupsByScopeAndCategory = useCallback(getGroupsByScopeAndCategory, []);

  // Отримуємо доступні scope для вибраних юнітів
  useEffect(() => {
    if (selectedUnits.length === 0) {
      setAvailableScopes([]);
      setSelectedScope(null);
      return;
    }

    // Отримуємо всі доступні scope
    const scopes = ['gather', 'build'];
    const availableScopes = scopes.filter(scope => {
      const groups = memoizedGetGroupsByScope(scope as 'gather' | 'build');
      console.log('[CommandPanel] Scope', scope, 'has groups:', groups);
      return groups.length > 0;
    });

    console.log('[CommandPanel] Available scopes:', availableScopes);
    setAvailableScopes(availableScopes);
    
    // Якщо немає доступних scope, скидаємо вибір
    if (availableScopes.length === 0) {
      setSelectedScope(null);
    }
  }, [selectedUnits, memoizedGetGroupsByScope]);

  // Отримуємо доступні категорії для обраного scope
  useEffect(() => {
    if (!selectedScope) {
      setSelectedScope(null);
      return;
    }

    const groups = memoizedGetGroupsByScope(selectedScope);
    console.log('[CommandPanel] Groups for scope', selectedScope, ':', groups);
    
    const categories = [...new Set(groups.map(group => group.ui?.category).filter(Boolean))] as string[];
    console.log('[CommandPanel] Available categories:', categories);
    setAvailableCategories(categories);
  }, [selectedScope, memoizedGetGroupsByScope]);

  // Обробник кліку по scope
  const handleScopeClick = useCallback((scope: 'gather' | 'build') => {
    setSelectedScope(selectedScope === scope ? null : scope);
  }, [selectedScope]);

  // Обробник кліку по команді
  const handleCommandClick = useCallback((commandGroup: CommandGroup) => {
    console.log('[CommandPanel] Command button clicked:', commandGroup.id);
    console.log('[CommandPanel] Command UI scope:', commandGroup.ui?.scope);
    console.log('[CommandPanel] Command UI object:', commandGroup.ui);
    
    // Якщо це команда збору ресурсів - запускаємо режим вибору області
    if (commandGroup.ui?.scope === 'gather') {
      console.log('[CommandPanel] Starting area selection mode for gather command');
      
      const newMode = {
        isActive: true,
        commandGroup,
        radius: 50
      };
      console.log('[CommandPanel] Setting new areaSelectionMode:', newMode);
      setAreaSelectionMode(newMode);
      console.log('[CommandPanel] areaSelectionMode set to active');
      
    } else {
      // Для інших команд - викликаємо звичайний обробник
      console.log('[CommandPanel] Not a gather command, calling onCommandSelect');
      onCommandSelect(commandGroup, { x: 0, y: 0, z: 0 });
    }
  }, [onCommandSelect]);

  // Обробник підтвердження вибору області
  const handleAreaConfirm = useCallback((position: { x: number; y: number; z: number }) => {
    if (areaSelectionMode.commandGroup) {
      console.log('[CommandPanel] Area confirmed for command:', areaSelectionMode.commandGroup.id, 'at position:', position);
      onCommandSelect(areaSelectionMode.commandGroup, position);
    }
    setAreaSelectionMode({ isActive: false, commandGroup: null, radius: 50 });
  }, [areaSelectionMode.commandGroup, onCommandSelect]);

  // Обробник скасування вибору області
  const handleAreaCancel = useCallback(() => {
    console.log('[CommandPanel] Area selection cancelled');
    setAreaSelectionMode({ isActive: false, commandGroup: null, radius: 50 });
  }, []);

  // Якщо немає вибраних юнітів, не показуємо панель
  if (selectedUnits.length === 0) {
    return null;
  }

  return (
    <>
      <div className="command-panel" style={{
        position: 'fixed',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        borderRadius: '8px',
        padding: '10px',
        color: 'white',
        zIndex: 9999,
        pointerEvents: 'auto'
      }}>
        {/* Панель scope */}
        <div className="scope-panel" style={{ marginBottom: '10px' }}>
          <div style={{ textAlign: 'center', marginBottom: '5px', fontSize: '12px', opacity: 0.7 }}>
            Available Commands
          </div>
          <div style={{ display: 'flex', gap: '5px' }}>
            {availableScopes.map(scope => (
              <button
                key={scope}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleScopeClick(scope as 'gather' | 'build');
                }}
                style={{
                  padding: '8px 16px',
                  backgroundColor: selectedScope === scope ? '#4CAF50' : '#666',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  textTransform: 'capitalize'
                }}
              >
                {scope}
              </button>
            ))}
          </div>
        </div>

        {/* Панель команд для обраного scope */}
        {selectedScope && (
          <div className="commands-panel">
            <div style={{ textAlign: 'center', marginBottom: '5px', fontSize: '12px', opacity: 0.7 }}>
              {selectedScope} Commands
            </div>
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', justifyContent: 'center' }}>
              {availableCategories.map(category => {
                const groups = memoizedGetGroupsByScopeAndCategory(selectedScope, category);
                return groups.map(group => (
                  <button
                    key={group.id}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      console.log('[CommandPanel] Button clicked directly:', group.id);
                      handleCommandClick(group);
                    }}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#2196F3',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '11px',
                      whiteSpace: 'nowrap',
                      pointerEvents: 'auto'
                    }}
                    title={group.ui?.description}
                  >
                    {group.ui?.name || group.name}
                  </button>
                ));
              })}
            </div>
          </div>
        )}

        {/* Інформація про вибрані юніти */}
        <div style={{ 
          textAlign: 'center', 
          marginTop: '10px', 
          fontSize: '11px', 
          opacity: 0.6,
          borderTop: '1px solid rgba(255, 255, 255, 0.2)',
          paddingTop: '10px'
        }}>
          {selectedUnits.length} unit{selectedUnits.length !== 1 ? 's' : ''} selected
        </div>
      </div>
      
      {/* Система вибору області */}
      <AreaSelectionSystem
        isActive={areaSelectionMode.isActive}
        radius={areaSelectionMode.radius}
        onConfirm={handleAreaConfirm}
        onCancel={handleAreaCancel}
      />
    </>
  );
};
