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
    
    // Коди фейлу при яких група команд має перезапуститися
    groupRestartCodes?: CommandFailureCode[];
}

export interface ParameterTemplate {
    type: 'resolved';
    parameterId: string;
    resolveWhen: 'group-start' | 'before-command';
}

/**
 * Коди фейлу команд для ідентифікації причини помилки
 */
export enum CommandFailureCode {
  RESOURCE_FINISHED = 'RESOURCE_FINISHED',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  STORAGE_FULL = 'STORAGE_FULL',
  INSUFFICIENT_POWER = 'INSUFFICIENT_POWER',
  TARGET_UNREACHABLE = 'TARGET_UNREACHABLE',
  OBJECT_NOT_FOUND = 'OBJECT_NOT_FOUND',
  INVALID_TARGET = 'INVALID_TARGET',
  OBJECT_STUCK = 'OBJECT_STUCK',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/**
 * Результат виконання команди
 */
export interface CommandResult {
    success: boolean;
    message: string;
    code?: CommandFailureCode; // Код фейлу для ідентифікації причини помилки
    data?: Record<string, any>; // Додаткові дані результату
}

export interface CommandContext {
    objectId: string;
    scene: any;
    deltaTime: number;
    mapLogic?: any; // MapLogic instance for executors to access resources and other logic
}

export type CommandType = 'move-to' | 'collect-resource' | 'unload-resources' | 'wait' | 'attack' | 'build' | 'charge';
