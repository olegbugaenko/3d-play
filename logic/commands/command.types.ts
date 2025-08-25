export type CommandStatus = 'pending' | 'executing' | 'completed' | 'failed' | 'cancelled';

export interface Command {
    id: string;
    type: CommandType;
    targetId?: string;
    position: { x: number; y: number; z: number };
    parameters?: Record<string, any>;
    status: CommandStatus;
    priority: number;
    createdAt: number;
    groupId?: string; // ID групи команд (опціонально)
    // Шаблони для динамічної резолюції параметрів
    parameterTemplates?: {
        position?: ParameterTemplate;
        targetId?: ParameterTemplate;
        [key: string]: ParameterTemplate | undefined;
    };
    // Явне мапінг параметрів з resolvePipeline
    resolvedParamsMapping?: {
        [commandField: string]: string; // поле команди -> ID параметра з resolvePipeline
    };
}

export interface ParameterTemplate {
    type: 'resolved';
    parameterId: string;
    resolveWhen: 'group-start' | 'before-command';
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
    mapLogic?: any; // MapLogic instance for executors to access resources and other logic
}

export type CommandType = 'move-to' | 'collect-resource' | 'unload-resources' | 'wait' | 'attack' | 'build' | 'charge';
