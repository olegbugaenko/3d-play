import React, { useState, useEffect, useCallback } from 'react';
import { CommandGroup } from '@systems/commands';
import { Game } from '@core/game/game';

interface CommandPanelProps {
  selectedUnits: string[];
  // onCommandSelect: (commandGroup: CommandGroup, centerPosition: { x: number; y: number; z: number }) => void;
  onCommandChange: (commandGroup: CommandGroup | null) => void;
  game: Game;
}

export const CommandPanel: React.FC<CommandPanelProps> = ({ selectedUnits, onCommandChange, game }) => {
  
  const [selectedScope, setSelectedScope] = useState<'gather' | 'build' | null>(null);
  const [availableScopes, setAvailableScopes] = useState<string[]>([]);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [selectedCommand, setSelectedCommand] = useState<CommandGroup | null>(null);

  // Отримуємо доступні scope для вибраних юнітів
  useEffect(() => {
    if (selectedUnits.length === 0) {
      setAvailableScopes([]);
      setSelectedScope(null);
      setSelectedCommand(null);
      onCommandChange(null);
      return;
    }

    // Отримуємо всі доступні scope через CommandGroupSystem
    const scopes = ['gather', 'build'];
    const availableScopes = scopes.filter(scope => {
      const groups = game.commandGroupSystem.getAvailableGroupsByScope(scope as 'gather' | 'build');
      return groups.length > 0;
    });

    setAvailableScopes(availableScopes);
    
    // Якщо немає доступних scope, скидаємо вибір
    if (availableScopes.length === 0) {
      setSelectedScope(null);
      setSelectedCommand(null);
      onCommandChange(null);
    }
  }, [selectedUnits, game.commandGroupSystem, onCommandChange]);

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

  // Обробник кліку по scope
  const handleScopeClick = useCallback((scope: 'gather' | 'build') => {
    setSelectedScope(selectedScope === scope ? null : scope);
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

  return (
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
              const groups = game.commandGroupSystem.getAvailableGroupsByScopeAndCategory(selectedScope, category);
              return groups.map(group => (
                <button
                  key={group.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleCommandClick(group);
                  }}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: selectedCommand?.id === group.id ? '#4CAF50' : '#2196F3',
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

      {/* Інформація про вибрані юніти та команду */}
      <div style={{ 
        textAlign: 'center', 
        marginTop: '10px', 
        fontSize: '11px', 
        opacity: 0.6,
        borderTop: '1px solid rgba(255, 255, 255, 0.2)',
        paddingTop: '10px'
      }}>
        {selectedUnits.length} unit{selectedUnits.length !== 1 ? 's' : ''} selected
        {selectedCommand && (
          <div style={{ marginTop: '5px' }}>
            Selected: {selectedCommand.ui?.name || selectedCommand.name}
          </div>
        )}
      </div>
    </div>
  );
};
