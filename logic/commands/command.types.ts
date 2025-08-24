export interface Command {
    id: string;
    type: string;
    targetId?: string;
    position?: { x: number; y: number; z: number };
    parameters?: Record<string, any>;
    status: 'pending' | 'executing' | 'completed' | 'failed' | 'cancelled';
    priority: number;
    createdAt: number;
}

export interface CommandResult {
    success: boolean;
    message?: string;
    data?: any;
}

export interface CommandContext {
    objectId: string;
    scene: any;
    deltaTime: number;
}

export type CommandType = 'move-to' | 'collect-resource' | 'wait' | 'attack' | 'build';
