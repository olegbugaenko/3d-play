import type { EnvironmentConfig } from '@systems/environment/environment.types';

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
        },
        
        // Налаштування біомаси
        biomass: {
            clusterCount: 60,         // Кількість кластерів біомаси
            biomassPerCluster: 15,    // Рослин на кластер
            clusterRadius: { min: 4, max: 6 }, // Радіус кластера
            resourceTypes: ['biomass'] as const
        },
        
        // Загальні налаштування для ресурсів
        resources: {
            minDistanceBetweenResources: 1.0  // Мінімальна відстань між будь-якими ресурсами (м)
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
    },

    environment: {
        time: {
            dayLengthMinutes: 24,
            sunriseHour: 6,
            sunsetHour: 18,
            twilightDurationHours: 1,
            initialHour: 12,
            initialMinute: 0,
        },
        weather: {
            temperature: { min: -50, max: 20 },
            windSpeed: { min: 2, max: 18, changeIntervalHours: 2, transitionSeconds: 12 },
        },
        dustClouds: {
            spawnIntervalSeconds: 60,
            ttlSeconds: 60,
            fadeDurationSeconds: 15,
            initialCount: 2,
            size: { min: 21, max: 43 },
            height: { min: 4, max: 12 },
            windSpeed: { min: 0.3, max: 1.0 },
            particleCount: 200,
            color: 0xd2b46c,
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
        biomass: {
            clusterCount: number;
            biomassPerCluster: number;
            clusterRadius: { min: number; max: number };
            resourceTypes: readonly ('biomass')[];
        };
        resources: {
            minDistanceBetweenResources: number;
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
    environment?: Partial<EnvironmentConfig>;
}
