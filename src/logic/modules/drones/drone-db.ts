import type { DroneTypeData } from './drone.types';

export type { DroneDustTrailConfig, DroneTypeData } from './drone.types';

// База даних типів дронів
export const DRONE_TYPES_DB: Map<string, DroneTypeData> = new Map([
    ['basic_rover', {
        id: 'basic_rover',
        name: 'Basic Rover',
        description: 'Базовий дрон для збору ресурсів',
        baseMovementSpeed: 1.5,
        baseCollectionSpeed: 0.1,
        baseInventoryCapacity: 5,
        baseUnloadSpeed: 1.0,
        baseLoadSpeed: 1.0,
        baseBuildSpeed: 0.5,
        baseBatteryCapacity: 15,
        baseEfficiencyMultiplier: 1.0,
        ui: {
            modelPath: 'models/rover_animated.glb',
            defaultScale: { x: 0.5, y: 0.5, z: 0.5 },
            rotationOffset: 0,
            iconName: 'rover-icon.png',
            color: '#4A90E2'
        },
        dustTrail: {
            enabled: true,
            particleSize: 0.65,
            emissionRate: 18,
            lifetime: 1.2,
            maxParticles: 60,
            color: '#bca98f'
        }
    }],
    
    ['advanced_rover', {
        id: 'advanced_rover',
        name: 'Advanced Rover',
        description: 'Покращений дрон з кращими характеристиками',
        baseMovementSpeed: 3.0,
        baseCollectionSpeed: 1.5,
        baseInventoryCapacity: 75,
        baseUnloadSpeed: 2.5,
        baseLoadSpeed: 2.0,
        baseBuildSpeed: 1.0,
        baseBatteryCapacity: 150,
        baseEfficiencyMultiplier: 1.2,
        ui: {
            defaultScale: { x: 1.0, y: 1.0, z: 1.0 },
            rotationOffset: 0,
            iconName: 'advanced-rover-icon.png',
            color: '#7B68EE'
        },
        dustTrail: {
            enabled: true,
            particleSize: 0.5,
            emissionRate: 22,
            lifetime: 1.6,
            maxParticles: 80,
            color: '#c8b08c'
        }
    }],
    
    ['heavy_rover', {
        id: 'heavy_rover',
        name: 'Heavy Rover',
        description: 'Важкий дрон з великою місткістю',
        baseMovementSpeed: 1.5,
        baseCollectionSpeed: 2.0,
        baseInventoryCapacity: 120,
        baseUnloadSpeed: 1.5,
        baseLoadSpeed: 1.5,
        baseBuildSpeed: 0.8,
        baseBatteryCapacity: 200,
        baseEfficiencyMultiplier: 1.5,
        ui: {
            defaultScale: { x: 1.2, y: 1.2, z: 1.2 },
            rotationOffset: 0,
            iconName: 'heavy-rover-icon.png',
            color: '#8B4513'
        },
        dustTrail: {
            enabled: false,
            particleSize: 0.55,
            emissionRate: 14,
            lifetime: 1.8,
            maxParticles: 70,
            color: '#978065'
        }
    }]
]);

// Метод для отримання типу дрону за ID
export function getDroneType(id: string): DroneTypeData | undefined {
    return DRONE_TYPES_DB.get(id);
}

// Метод для отримання всіх типів дронів
export function getAllDroneTypes(): Map<string, DroneTypeData> {
    return new Map(DRONE_TYPES_DB);
}

// Метод для перевірки чи існує тип дрону
export function isDroneTypeExists(id: string): boolean {
    return DRONE_TYPES_DB.has(id);
}

// Метод для отримання кількості типів дронів
export function getDroneTypesCount(): number {
    return DRONE_TYPES_DB.size;
}

