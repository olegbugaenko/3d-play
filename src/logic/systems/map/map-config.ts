// Конфігурація розмірів мапи
export const MAP_CONFIG = {
    // Розміри світу
    width: 600,      // Ширина мапи по X
    height: 600,     // Висота мапи по Y (для об'єктів)
    depth: 600,       // Глибина мапи по Z
    
    // Налаштування генерації
    generation: {
        // Seed для процедурної генерації (0 = випадковий)
        defaultSeed: 117,
        
        // Налаштування каменюків
        rocks: {
            clusterCount: 100,        // Кількість кластерів
            rocksPerCluster: 20,      // Каменюків на кластер
            clusterRadius: { min: 3, max: 4 }, // Радіус кластера
            resourceTypes: ['stone', 'ore'] as const
        },
        
        // Налаштування болдерів
        boulders: {
            count: 50,                // Загальна кількість
            minDistance: 15,          // Мінімальна відстань між болдерами
            sizeRange: { min: 0.25, max: 0.7 } // Розмір болдерів
        }
    },
    
    // Terrain налаштування
    terrain: {
        resolution: 10,    // Data resolution для пам'яті
        maxHeight: 25,     // Максимальна висота terrain
        minHeight: 0,      // Мінімальна висота terrain
        renderResolution: 2, // Render resolution для візуальної якості
        
        // Текстури для пустинного пейзажу
        textures: {
            sand: { 
                weight: 0.1, 
                texturePath: '/textures/sand.png',     // Шлях до текстури
                tiling: { x: 0.2, y: 0.2 }            // Збільшуємо tiling в 20 разів (було 5x5)
            },
            stone: { 
                weight: 0.7, 
                texturePath: '/textures/rigalite.png', // Шлях до текстури
                tiling: { x: 0.2, y: 0.2 }            // Збільшуємо tiling в 20 разів
            },
            volcanic: { 
                weight: 0.2, 
                texturePath: '/textures/volcanic.png', // Шлях до текстури
                tiling: { x: 1, y: 1 }            // Збільшуємо tiling в 20 разів
            }
        },
        
        // Налаштування для procedural генерації
        noise: {
            scale: 0.01,        // Ще менший масштаб для дуже плавного terrain
            octaves: 1,         // Тільки 1 октава для максимальної плавності
            persistence: 0.3,   // Менша персистентність для плавності
            lacunarity: 1.1     // Залишаємо лакунарність
        }
    },
    
    // Об'єкти
    objects: {
        gridSize: 100,     // Розмір сітки об'єктів (100x100)
        spacing: 5,        // Відстань між об'єктами
        offset: 100,       // Зміщення від центру
        
        // Налаштування за замовчуванням для різних типів
        defaults: {
            cube: {
                anchorPoint: 'bottom' as const,  // Куб стоїть на своєму низу
                scale: { x: 1, y: 1, z: 1 }
            },
            sphere: {
                anchorPoint: 'center' as const,  // Сфера центрована
                scale: { x: 1, y: 1, z: 1 }
            }
        }
    }
};

// Типи для конфігурації
export interface MapConfig {
    width: number;
    height: number;
    depth: number;
    generation: {
        defaultSeed: number;
        rocks: {
            clusterCount: number;
            rocksPerCluster: number;
            clusterRadius: { min: number; max: number };
            resourceTypes: readonly ('stone' | 'ore')[];
        };
        boulders: {
            count: number;
            minDistance: number;
            sizeRange: { min: number; max: number };
        };
    };
    terrain: {
        resolution: number;
        maxHeight: number;
        minHeight: number;
        renderResolution: number;
    };
    objects: {
        gridSize: number;
        spacing: number;
        offset: number;
    };
}
