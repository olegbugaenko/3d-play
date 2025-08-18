import { Vector3 } from './scene.types';

export interface TerrainConfig {
    width: number;
    height: number;
    resolution: number; // Розмір однієї клітинки terrain
    maxHeight: number;
    minHeight: number;
    noise?: {
        scale: number;
        octaves: number;
        persistence: number;
        lacunarity: number;
    };
    textures?: {
        [key: string]: {
            weight: number;
            texturePath: string;  // Шлях до текстури замість color
            tiling?: { x: number, y: number };
        };
    };
}

export interface HeightMap {
    data: number[][]; // 2D масив висот
    width: number;
    height: number;
    resolution: number;
}

export class TerrainManager {
    private heightMap: HeightMap;
    private config: TerrainConfig;

    constructor(config: TerrainConfig) {
        this.config = config;
        this.heightMap = this.generateDefaultHeightMap();
    }

    /**
     * Генерує базову карту висот з шумом
     */
    private generateDefaultHeightMap(): HeightMap {
        const { width, height, resolution } = this.config;
        const cols = Math.ceil(width / resolution);
        const rows = Math.ceil(height / resolution);
        
        const data: number[][] = [];
        
        for (let z = 0; z < rows; z++) {
            data[z] = [];
            for (let x = 0; x < cols; x++) {
                // Простий шум для початку - можна замінити на Perlin noise
                const noise = this.simpleNoise(x * 0.2, z * 0.2);
                const height = this.config.minHeight + 
                    (this.config.maxHeight - this.config.minHeight) * noise;
                data[z][x] = height;
            }
        }

        return {
            data,
            width: cols,
            height: rows,
            resolution
        };
    }

    /**
     * Простий шум функція (заглушка для Perlin noise)
     */
    private simpleNoise(x: number, z: number): number {
        // Тут можна замінити на справжній Perlin noise
        return (Math.sin(x) * Math.cos(z) + 1) / 2;
    }

    /**
     * Генерує procedural noise для текстурних зон
     */
    private generateTextureNoise(x: number, z: number): number {
        const { scale, octaves, persistence, lacunarity } = this.config.noise || {
            scale: 0.05,        // Використовуємо актуальні параметри
            octaves: 3,         // з MAP_CONFIG
            persistence: 0.3,
            lacunarity: 3.0
        };
        
        // Додаємо "розмиття" координат для плавніших переходів
        const blurAmount = 5; // Кількість одиниць для розмиття
        const blurScale = 0.1; // Масштаб для blur noise
        
        const blurX = x + this.simpleNoise(x * blurScale, z * blurScale) * blurAmount;
        const blurZ = z + this.simpleNoise(x * blurScale, z * blurScale) * blurAmount;
        
        let amplitude = 1.0;
        let frequency = 1.0;
        let noiseValue = 0.0;
        let maxValue = 0.0;
        
        for (let i = 0; i < octaves; i++) {
            noiseValue += this.simpleNoise(blurX * frequency * scale, blurZ * frequency * scale) * amplitude;
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= lacunarity;
        }
        
        const result = noiseValue / maxValue; // Нормалізуємо до 0-1
        
        // Логуємо тільки для перших кількох викликів
        if (Math.random() < 0.001) { // 0.1% шанс логування
            // generateTextureNoise completed
        }
        
        return result;
    }

    /**
     * Отримує blend factor для текстури в точці (0-1)
     */
    getTextureBlend(x: number, z: number, textureName: string): number {
        const noiseValue = this.generateTextureNoise(x, z);
        const { textures } = this.config;
        
        if (!textures || !textures[textureName]) return 0;
        
        // Отримуємо всі текстури та їх ваги
        const textureEntries = Object.entries(textures);
        const totalWeight = textureEntries.reduce((sum, [_, data]) => sum + data.weight, 0);
        
        // Знаходимо нашу текстуру та її позицію
        let currentWeight = 0;
        for (const [name, data] of textureEntries) {
            if (name === textureName) {
                // Нормалізуємо noiseValue до загальної ваги
                const normalizedNoise = noiseValue * totalWeight;
                
                // Якщо noiseValue попадає в зону цієї текстури
                if (normalizedNoise >= currentWeight && normalizedNoise < currentWeight + data.weight) {
                    // Повертаємо blend factor пропорційно вазі текстури
                    return data.weight / totalWeight;
                }
                return 0;
            }
            currentWeight += data.weight;
        }
        
        return 0;
    }

    /**
     * Отримує всі blend factors для точки
     */
    getAllTextureBlends(x: number, z: number): { [key: string]: number } {
        const { textures } = this.config;
        if (!textures) return {};
        
        const blends: { [key: string]: number } = {};
        for (const textureName of Object.keys(textures)) {
            blends[textureName] = this.getTextureBlend(x, z, textureName);
        }
        
        // Нормалізуємо blend factors щоб сума = 1
        const totalBlend = Object.values(blends).reduce((sum, blend) => sum + blend, 0);
        if (totalBlend > 0) {
            for (const textureName of Object.keys(blends)) {
                blends[textureName] /= totalBlend;
            }
        }
        
        return blends;
    }

    /**
     * Отримує висоту terrain в заданій точці з інтерполяцією
     */
    getHeightAt(x: number, z: number): number {
        const { width, height, resolution } = this.heightMap;
        
        // Нормалізуємо координати до grid
        const gridX = (x + this.config.width / 2) / resolution;
        const gridZ = (z + this.config.height / 2) / resolution;
        
        // Отримуємо індекси сусідніх точок
        const x1 = Math.floor(gridX);
        const z1 = Math.floor(gridZ);
        const x2 = Math.min(x1 + 1, width - 1);
        const z2 = Math.min(z1 + 1, height - 1);
        
        // Перевіряємо межі
        if (x1 < 0 || x1 >= width || z1 < 0 || z1 >= height) {
            return this.config.minHeight;
        }
        
        // Отримуємо висоти в чотирьох сусідніх точках
        const h11 = this.heightMap.data[z1][x1];
        const h12 = this.heightMap.data[z1][x2];
        const h21 = this.heightMap.data[z2][x1];
        const h22 = this.heightMap.data[z2][x2];
        
        // Обчислюємо коефіцієнти інтерполяції
        const fx = gridX - x1;
        const fz = gridZ - z1;
        
        // Білінійна інтерполяція
        const h1 = h11 * (1 - fx) + h12 * fx;
        const h2 = h21 * (1 - fx) + h22 * fx;
        const interpolatedHeight = h1 * (1 - fz) + h2 * fz;
        
        return interpolatedHeight;
    }

    /**
     * Отримує нормаль terrain в заданій точці
     */
    getNormalAt(x: number, z: number): Vector3 {
        const delta = this.config.resolution * 0.5;
        
        const h1 = this.getHeightAt(x - delta, z);
        const h2 = this.getHeightAt(x + delta, z);
        const h3 = this.getHeightAt(x, z - delta);
        const h4 = this.getHeightAt(x, z + delta);
        
        // Обчислюємо нормаль на основі градієнта
        const dx = (h2 - h1) / (2 * delta);
        const dz = (h4 - h3) / (2 * delta);
        
        return {
            x: -dx,
            y: 1,
            z: -dz
        };
    }

    /**
     * Перевіряє, чи може об'єкт знаходитися в даній позиції
     */
    canPlaceObjectAt(position: Vector3, objectHeight: number = 0): boolean {
        const terrainHeight = this.getHeightAt(position.x, position.z);
        return position.y >= terrainHeight + objectHeight;
    }

    /**
     * Примусово розміщує об'єкт на terrain
     */
    snapToTerrain(position: Vector3, objectHeight: number = 0): Vector3 {
        const terrainHeight = this.getHeightAt(position.x, position.z);
        return {
            ...position,
            y: terrainHeight + objectHeight
        };
    }

    /**
     * Отримує конфігурацію terrain
     */
    getConfig(): TerrainConfig {
        return { ...this.config };
    }

    /**
     * Оновлює карту висот (для динамічних змін)
     */
    updateHeightMap(newHeightMap: HeightMap): void {
        this.heightMap = newHeightMap;
    }

    /**
     * Генерує новий terrain з заданими параметрами
     */
    regenerateTerrain(): void {
        // Тут можна додати різні алгоритми генерації
        this.heightMap = this.generateDefaultHeightMap();
    }
}
