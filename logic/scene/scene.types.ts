export interface Vector3 {
    x: number;
    y: number;
    z: number;
}

export interface TSceneObject<T = any> {
    id: string;
    coordinates: Vector3;
    type: string;
    scale: Vector3;
    rotation: Vector3;
    data: T;
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