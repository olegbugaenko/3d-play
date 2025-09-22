import { useState, useEffect } from 'react';
import { UiLogicBridge } from '../../../../logic/UiLogicBridge';
import './PathfindingDebug.css';

interface Props {
  uiLogicBridge: UiLogicBridge;
}

interface GridCell {
  x: number;
  z: number;
  passable: boolean;
}

interface RoadCell {
  x: number;
  z: number;
  isRoad: boolean;
  speedBonus: number;
}

function PathfindingDebug({ uiLogicBridge }: Props) {
  const [isVisible, setIsVisible] = useState(false);
  const [gridData, setGridData] = useState<GridCell[]>([]);
  const [roadData, setRoadData] = useState<RoadCell[]>([]);
  const [showRoads, setShowRoads] = useState(true);
  const [centerX, setCenterX] = useState(0);
  const [centerZ, setCenterZ] = useState(0);
  const [droneId, setDroneId] = useState('');
  const [radius, setRadius] = useState(20);

  const updateGrid = () => {
    if (!droneId.trim()) return;
    
    const data = uiLogicBridge.getPathfindingVisualizationData(
      centerX, 
      centerZ, 
      radius, 
      droneId.trim()
    );
    
    if (data) {
      setGridData(data);
    }

    // Завантажуємо дані доріг
    const roadsData = uiLogicBridge.getRoadsVisualizationData(
      centerX,
      centerZ,
      radius
    );
    
    if (roadsData) {
      setRoadData(roadsData);
    }
  };

  useEffect(() => {
    if (isVisible && droneId.trim()) {
      updateGrid();
    }
  }, [centerX, centerZ, radius, droneId, isVisible, showRoads]);

  if (!isVisible) {
    return (
      <div className="pathfinding-debug-toggle">
        <button onClick={() => setIsVisible(true)}>
          🗺️ Show Pathfinding Grid
        </button>
      </div>
    );
  }

  return (
    <div className="pathfinding-debug">
      <div className="pathfinding-debug-controls">
        <h3>Pathfinding Grid Debug</h3>
        <div className="controls-row">
          <label>
            Drone ID: 
            <input 
              type="text" 
              value={droneId} 
              onChange={(e) => setDroneId(e.target.value)}
              placeholder="drone-123"
            />
          </label>
          <label>
            Center X: 
            <input 
              type="number" 
              value={centerX} 
              onChange={(e) => setCenterX(Number(e.target.value))}
              step="1"
            />
          </label>
          <label>
            Center Z: 
            <input 
              type="number" 
              value={centerZ} 
              onChange={(e) => setCenterZ(Number(e.target.value))}
              step="1"
            />
          </label>
          <label>
            Radius: 
            <input 
              type="number" 
              value={radius} 
              onChange={(e) => setRadius(Number(e.target.value))}
              min="5"
              max="50"
              step="5"
            />
          </label>
        </div>
        <div className="controls-row">
          <label>
            <input 
              type="checkbox" 
              checked={showRoads} 
              onChange={(e) => setShowRoads(e.target.checked)}
            />
            Show Roads
          </label>
          <button onClick={updateGrid}>Update Grid</button>
          <button onClick={() => setIsVisible(false)}>Hide</button>
        </div>
      </div>
      
      <div className="pathfinding-grid">
        <div className="grid-legend">
          <span className="legend-item">
            <div className="legend-color passable"></div>
            Passable
          </span>
          <span className="legend-item">
            <div className="legend-color blocked"></div>
            Blocked
          </span>
          {showRoads && (
            <>
              <span className="legend-item">
                <div className="legend-color road-basic"></div>
                Road (+50%)
              </span>
              <span className="legend-item">
                <div className="legend-color road-fast"></div>
                Fast Road (+100%)
              </span>
            </>
          )}
        </div>
        
        <div className="grid-container">
          {gridData.map((cell, idx) => (
            <div
              key={`grid-${idx}`}
              className={`grid-cell ${cell.passable ? 'passable' : 'blocked'}`}
              style={{
                left: `${(cell.x - centerX + radius) * 4}px`,
                top: `${(cell.z - centerZ + radius) * 4}px`
              }}
              title={`(${cell.x.toFixed(1)}, ${cell.z.toFixed(1)}) - ${cell.passable ? 'Passable' : 'Blocked'}`}
            />
          ))}
          
          {showRoads && roadData.map((road, idx) => {
            if (!road.isRoad) return null;
            
            const getRoadClass = (speedBonus: number) => {
              if (speedBonus >= 2.0) return 'road-fast';
              if (speedBonus >= 1.5) return 'road-basic';
              return 'road-basic';
            };
            
            return (
              <div
                key={`road-${idx}`}
                className={`grid-cell road ${getRoadClass(road.speedBonus)}`}
                style={{
                  left: `${(road.x - centerX + radius) * 4}px`,
                  top: `${(road.z - centerZ + radius) * 4}px`,
                  zIndex: 5 // показуємо дороги поверх звичайних клітинок
                }}
                title={`(${road.x.toFixed(1)}, ${road.z.toFixed(1)}) - Road (${road.speedBonus}x speed)`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default PathfindingDebug;
