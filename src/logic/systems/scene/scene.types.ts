
import { Vector3 } from '@utils/vector-math';

export interface TSceneObject<T = any> {
    id: string;
    type: string;
    coordinates: Vector3;
    scale: Vector3;
    rotation: Vector3;
    rotation2D?: number; // 2D ротація відносно нормалі поверхні (для terrainAlign об'єктів)
    speed?: Vector3;
    data: T;
    tags: string[]; // Теги для швидкого доступу та фільтрації
    bottomAnchor?: number; // Зміщення від центру до низу об'єкта (наприклад, -0.5 для куба)
    terrainAlign?: boolean; // Автоматично нахиляти об'єкт по нормалі terrain
    targetType?: string[];
    commandType?: string[]; // Доступні типи команд для об'єкта
}

export interface TSceneViewport {
    centerX: number;
    centerY: number;
    width: number;
    height: number;
}

// Grid system types
export interface GridCell {
    objects: Set<string>; // ID об'єктів у цьому грід-селі
}

export interface GridSystem {
    cellSize: number; // Розмір однієї клітинки гріду
    grid: Map<string, GridCell>; // key: "x,z" координати гріду
}