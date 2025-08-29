export interface DroneTypeData {
    id: string;
    name: string;
    description: string;
    baseMovementSpeed: number;
    baseCollectionSpeed: number;
    baseInventoryCapacity: number;
    baseUnloadSpeed: number;
    baseBatteryCapacity: number;
    baseEfficiencyMultiplier: number;
    ui: {
        defaultScale: { x: number; y: number; z: number };
        rotationOffset: number;
        iconName: string;
        color: string;
        modelPath?: string;
    };
}

// База даних типів дронів
export const DRONE_TYPES_DB: Map<string, DroneTypeData> = new Map([
    ['basic_rover', {
        id: 'basic_rover',
        name: 'Basic Rover',
        description: 'Базовий дрон для збору ресурсів',
        baseMovementSpeed: 2.0,
        baseCollectionSpeed: 0.1,
        baseInventoryCapacity: 5,
        baseUnloadSpeed: 1.0,
        baseBatteryCapacity: 15,
        baseEfficiencyMultiplier: 1.0,
        ui: {
            defaultScale: { x: 0.4, y: 0.4, z: 0.4 },
            rotationOffset: 0,
            iconName: 'rover-icon.png',
            color: '#4A90E2'
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
        baseBatteryCapacity: 150,
        baseEfficiencyMultiplier: 1.2,
        ui: {
            defaultScale: { x: 1.0, y: 1.0, z: 1.0 },
            rotationOffset: 0,
            iconName: 'advanced-rover-icon.png',
            color: '#7B68EE'
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
        baseBatteryCapacity: 200,
        baseEfficiencyMultiplier: 1.5,
        ui: {
            defaultScale: { x: 1.2, y: 1.2, z: 1.2 },
            rotationOffset: 0,
            iconName: 'heavy-rover-icon.png',
            color: '#8B4513'
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

