import type { Vector3 } from '@utils/vector-math';

export interface DroneDustTrailConfig {
    enabled: boolean;
    particleSize: number;
    emissionRate: number;
    lifetime: number;
    maxParticles?: number;
    color?: string;
}

export interface DroneTypeData {
    id: string;
    name: string;
    description: string;
    baseMovementSpeed: number;
    baseCollectionSpeed: number;
    baseInventoryCapacity: number;
    baseUnloadSpeed: number;
    baseLoadSpeed: number;        // Швидкість завантаження ресурсів зі складу
    baseBuildSpeed: number;       // Швидкість будівництва
    baseBatteryCapacity: number;
    baseEfficiencyMultiplier: number;
    ui: {
        defaultScale: { x: number; y: number; z: number };
        rotationOffset: number;
        iconName: string;
        color: string;
        modelPath?: string;
    };
    dustTrail?: DroneDustTrailConfig;
}

export interface Drone {
    id: string;
    position: Vector3;
    status: 'idle' | 'busy' | 'charging';
    currentCommandId?: string;
    battery: number;
    maxBattery: number;
    inventory: Record<string, number>;
    maxInventory: number;
    efficiency: number;
    speed: number;
    maxSpeed: number;
    dustTrail?: DroneDustTrailConfig;
}
