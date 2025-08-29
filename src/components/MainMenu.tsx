import React, { useState, useEffect } from 'react';
import { Game } from '@core/game/game';
import './MainMenu.css';

interface MainMenuProps {
    onStartGame: () => void;
    game: Game;
}

export const MainMenu: React.FC<MainMenuProps> = ({ onStartGame, game }) => {
    const [saveSlots, setSaveSlots] = useState<Array<{ slot: number; timestamp: number; hasData: boolean }>>([]);
    const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
    
    useEffect(() => {
        updateSaveSlots();
    }, []);
    
    const updateSaveSlots = () => {
        setSaveSlots(game.getSaveSlots());
    };
    
    const handleNewGame = () => {
        game.newGame();
        onStartGame();
    };
    
    const handleLoadGame = () => {
        if (selectedSlot) {
            const success = game.loadGame(selectedSlot);
            if (success) {
                onStartGame();
            } else {
                alert('Помилка завантаження гри');
            }
        }
    };
    
    const handleDeleteSlot = (slot: number) => {
        if (confirm(`Видалити збереження в слоті ${slot}?`)) {
            game.deleteSlot(slot);
            updateSaveSlots();
            if (selectedSlot === slot) {
                setSelectedSlot(null);
            }
        }
    };
    
    const formatTimestamp = (timestamp: number): string => {
        if (timestamp === 0) return 'Порожній';
        return new Date(timestamp).toLocaleString();
    };
    
    return (
        <div className="main-menu">
            <div className="menu-container">
                <h1 className="game-title">Framework 3D Game</h1>
                
                <div className="menu-buttons">
                    <button 
                        className="new-game-btn"
                        onClick={handleNewGame}
                    >
                        Нова гра
                    </button>
                    
                    <button 
                        className="load-game-btn"
                        onClick={handleLoadGame}
                        disabled={!selectedSlot}
                    >
                        Завантажити гру
                    </button>
                </div>
                
                <div className="save-slots">
                    <h3>Слоти збереження:</h3>
                    <div className="slots-grid">
                        {saveSlots.map(slot => (
                            <div 
                                key={slot.slot}
                                className={`save-slot ${selectedSlot === slot.slot ? 'selected' : ''}`}
                                onClick={() => setSelectedSlot(slot.slot)}
                            >
                                <div className="slot-info">
                                    <span className="slot-number">Слот {slot.slot}</span>
                                    <span className="slot-time">{formatTimestamp(slot.timestamp)}</span>
                                </div>
                                
                                {slot.hasData && (
                                    <button 
                                        className="delete-slot-btn"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteSlot(slot.slot);
                                        }}
                                    >
                                        Видалити
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
