// Конфігурація розмірів мапи
export const MAP_CONFIG = {
    // Розміри світу
    width: 2000,      // Ширина мапи по X
    height: 2000,     // Висота мапи по Y (для об'єктів)
    depth: 2000,       // Глибина мапи по Z
    
    // Terrain налаштування
    terrain: {
        resolution: 10,    // Data resolution для пам'яті
        maxHeight: 20,     // Максимальна висота terrain
        minHeight: 0,      // Мінімальна висота terrain
        renderResolution: 2, // Render resolution для візуальної якості
        
        // Текстури для пустинного пейзажу
        textures: {
            sand: { 
                weight: 0.1, 
                texturePath: '/textures/sand.png',     // Шлях до текстури
                tiling: { x: 100, y: 100 }            // Збільшуємо tiling в 20 разів (було 5x5)
            },
            stone: { 
                weight: 0.7, 
                texturePath: '/textures/rigalite.png', // Шлях до текстури
                tiling: { x: 100, y: 100 }            // Збільшуємо tiling в 20 разів
            },
            volcanic: { 
                weight: 0.2, 
                texturePath: '/textures/volcanic.png', // Шлях до текстури
                tiling: { x: 100, y: 100 }            // Збільшуємо tiling в 20 разів
            }
        },
        
        // Налаштування для procedural генерації
        noise: {
            scale: 0.02,        // Зменшуємо масштаб noise для більших кластерів
            octaves: 2,         // Залишаємо 1 октаву для різкого noise
            persistence: 0.9,   // Збільшуємо персистентність
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
