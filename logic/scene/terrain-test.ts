import { TerrainManager, TerrainConfig } from './terrain-manager';
import { Vector3 } from './scene.types';

/**
 * Тестування TerrainManager
 */
export function testTerrainSystem() {
    // Testing Terrain System...
    
    // Створюємо terrain з тестовою конфігурацією
    const config: TerrainConfig = {
        width: 100,
        height: 100,
        resolution: 10,
        maxHeight: 20,
        minHeight: -5
    };
    
    const terrain = new TerrainManager(config);
    
    // Тестуємо отримання висоти в різних точках
    const testPoints: Vector3[] = [
        { x: 0, y: 0, z: 0 },
        { x: 25, y: 0, z: 25 },
        { x: -25, y: 0, z: -25 },
        { x: 50, y: 0, z: 50 }
    ];
    
    // Testing height at different points
    testPoints.forEach(point => {
        const height = terrain.getHeightAt(point.x, point.z);
        // Point height calculated
    });
    
    // Тестуємо terrain constraint
    // Testing terrain constraints
    const testObjects = [
        { position: { x: 0, y: 15, z: 0 }, height: 2, tags: ['on-ground'] },
        { position: { x: 25, y: 5, z: 25 }, height: 1, tags: ['on-ground'] },
        { position: { x: -25, y: 30, z: -25 }, height: 3, tags: ['floating'] }
    ];
    
    testObjects.forEach(obj => {
        const canPlace = terrain.canPlaceAt(obj.position, obj.height);
        const snappedPosition = terrain.snapToTerrain(obj.position, obj.height);
        
        // Object testing completed
    });
    
    // Terrain system test completed
}

/**
 * Генерує тестову карту висот
 */
export function generateTestHeightMap(): number[][] {
    const size = 20;
    const heightMap: number[][] = [];
    
    for (let z = 0; z < size; z++) {
        heightMap[z] = [];
        for (let x = 0; x < size; x++) {
            // Створюємо хвилястий terrain
            const distance = Math.sqrt(x * x + z * z);
            const height = Math.sin(distance * 0.3) * 5 + Math.cos(x * 0.2) * 3;
            heightMap[z][x] = height;
        }
    }
    
    return heightMap;
}
