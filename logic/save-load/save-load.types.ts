import { Vector3 } from '../utils/vector-math';

// Базовий інтерфейс для всіх менеджерів
export interface SaveLoadManager {
    save(): SaveData;
    load(data: SaveData): void;
    reset(): void;
}

// Структура збереження гри
export interface GameSave {
    slot: number;
    timestamp: number;
    version: string;
    
    // Дані менеджерів
    resourceManager: ResourceSaveData;
    mapLogic: MapLogicSaveData;
    commandSystem: CommandSystemSaveData;
    commandGroupSystem: CommandGroupSystemSaveData;
    droneManager: DroneSaveData;
    upgradesManager: UpgradesManagerSaveData;
    buildingsManager: BuildingsManagerSaveData;
}

// Дані ресурсів
export interface ResourceSaveData {
    collectedResources: Array<{
        clusterId: number;
        rockId: number;
        resourceType: string;
        collectedAt: number;
    }>;
    resourceCounts: Record<string, number>;
}

// Дані карти
export interface MapLogicSaveData {
    seed: number; // Seed для генерації карти
    collectedRocks: string[] | Set<string> | Record<string, string>; // ID зібраних каменюків (різні типи для сумісності)
    // buildingPositions тепер зберігаються в BuildingsManager
}

// Дані командної системи
export interface CommandSystemSaveData {
    commandQueues: Array<{
        objectId: string;
        commands: Array<{
            id: string;
            type: string;
            status: 'pending' | 'active' | 'completed' | 'failed';
            parameters: Record<string, any>;
            progress?: number;
            groupId?: string;
            resolvedParamsMapping?: Record<string, string>; // Додаємо мапінг параметрів
            groupRestartCodes?: string[]; // Додаємо статус коди для restart групи
        }>;
    }>;
    activeCommands: Array<{
        id: string;
        groupId: string;
        executorId: string;
        status: 'active' | 'paused';
        progress: number;
    }>;
}

// Дані системи груп команд
export interface CommandGroupSystemSaveData {
    activeGroups: Array<{
        groupKey: string;
        groupId: string;
        objectId: string;
        status: string;
        currentTaskIndex: number;
        startTime: number;
        context: Record<string, any>;
        resolvedParameters: Record<string, any>;
    }>;
}

// Дані дронів
export interface DroneSaveData {
    drones: Array<{
        id: string;
        type: string;
        position: Vector3;
        status: 'idle' | 'busy' | 'charging';
        currentCommandId?: string;
        battery: number;
        inventory: Record<string, number>;
    }>;
}

// Дані менеджера апгрейдів
export interface UpgradesManagerSaveData {
    upgradeStates: Record<string, {
        level: number;
        unlocked: boolean;
    }>;
}

// Дані менеджера будівель
export interface BuildingsManagerSaveData {
  buildingInstances: Array<{
    id: string;
    typeId: string;
    level: number;
    built: boolean;
    position?: {
      x: number;
      y: number;
      z: number;
    };
  }>;
}

// Тип для даних менеджера
export type SaveData = ResourceSaveData | MapLogicSaveData | CommandSystemSaveData | CommandGroupSystemSaveData | DroneSaveData | UpgradesManagerSaveData | BuildingsManagerSaveData;
