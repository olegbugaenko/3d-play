## Commands: Command
**Файл(и):** `src/logic/systems/commands/command.types.ts`
**Призначення:** Основний інтерфейс команди, що визначає структуру команди та її параметри.

### Публічні типи/інтерфейси
```ts
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

export type CommandStatus = 'pending' | 'executing' | 'completed' | 'failed' | 'cancelled';

export type CommandType = 'move-to' | 'collect-resource' | 'unload-resources' | 'load-resources' | 'wait' | 'attack' | 'build' | 'charge' | 'conditional-loop';

export interface ParameterTemplate {
    type: 'resolved';
    parameterId: string;
    resolveWhen: 'group-start' | 'before-command';
}

export enum CommandFailureCode {
  RESOURCE_FINISHED = 'RESOURCE_FINISHED',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  STORAGE_FULL = 'STORAGE_FULL',
  INSUFFICIENT_POWER = 'INSUFFICIENT_POWER',
  INSUFFICIENT_RESOURCES = 'INSUFFICIENT_RESOURCES',
  TARGET_UNREACHABLE = 'TARGET_UNREACHABLE',
  TARGET_INACCESSIBLE = 'TARGET_INACCESSIBLE',
  OBJECT_NOT_FOUND = 'OBJECT_NOT_FOUND',
  INVALID_TARGET = 'INVALID_TARGET',
  OBJECT_STUCK = 'OBJECT_STUCK',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export interface CommandResult {
    success: boolean;
    message: string;
    code?: CommandFailureCode;
    data?: Record<string, any>;
}

export interface CommandContext {
    objectId: string;
    scene: any;
    deltaTime: number;
    mapLogic?: IMapLogic;
}
```

---

## Commands: CommandGroup
**Файл(и):** `src/logic/systems/commands/command-group.types.ts`
**Призначення:** Визначення групи команд з пайплайнами виконання та резолюції параметрів.

### Публічні типи/інтерфейси
```ts
export interface CommandGroup {
  id: string;
  name: string;
  description?: string;
  startCondition?: CommandGroupCondition | null;
  endCondition?: CommandGroupCondition | null;
  loopCondition?: CommandGroupCondition | null;
  isLoop?: boolean; // Якщо true, команди будуть повторюватися після завершення
  loopConditions?: LoopConditions; // Розширені умови циклічності
  autoExecute?: AutoExecuteConfig; // Автоматичне виконання
  resolveParametersPipeline?: ResolveParametersPipeline[]; // Пайплайн резолюції параметрів
  tasksPipeline: CommandGroupPipeline;
  ui?: CommandGroupUI; // UI метадані
  requirements?: Requirement[]; // Додаємо реквайрменти
}

export interface CommandGroupContext {
  objectId: string;
  targets: {
    resource?: string;           // ID ресурсу
    base?: { x: number; y: number; z: number }; // координати бази
    [key: string]: any;          // інші таргети
  };
  parameters: {
    resourceType?: string;
    amount?: number;
    priority?: string;
    [key: string]: any;          // інші параметри
  };
  resolved?: Record<string, any>; // Розв'язані параметри
}

export interface CommandGroupState {
  groupId: string;
  objectId: string;
  status: 'active' | 'completed' | 'cancelled' | 'failed';
  currentTaskIndex: number;
  startTime: number;
  context: CommandGroupContext;
  resolvedParameters?: Record<string, any>; // Розв'язані параметри
}

export interface CommandGroupUI {
  scope: 'gather' | 'build' | 'none';
  category: string; // 'stone', 'ore', 'all', 'building', 'repair'
  name: string;
  description: string;
}

export type CommandGroupCondition = (context: CommandGroupContext) => boolean;

export type CommandGroupPipeline = (context: CommandGroupContext) => Command[];

export interface ResolveParametersPipeline {
  id: string;
  getterType: string;
  args: ParameterArg[];
  resolveWhen: 'group-start' | 'before-command';
}

export interface ParameterArg {
  type: ParameterArgType;
  value: any;
}

export type ParameterArgType = 'var' | 'lit';
```

---

## Commands: ICommandSystem
**Файл(и):** `src/logic/interfaces/ICommandSystem.ts`
**Призначення:** Інтерфейс головної системи управління командами.

### Публічні типи/інтерфейси
```ts
export interface ICommandSystem extends SaveLoadManager {
  // Основні методи
  executeCommand(command: Command): CommandResult;
  addCommandToQueue(command: Command, objectId: string): boolean;
  removeCommandFromQueue(commandId: string, objectId: string): boolean;
  
  // Додаткові методи для CommandGroupSystem
  addAutoresolveCommand(objectId: string, command: Command, resolved: Record<string, any> | undefined): void;
  clearCommandsByGroup(objectId: string, groupId: string): void;
  
  // Отримання даних
  getCommandQueue(objectId: string): ICommandQueue | undefined;
  getAllCommandQueues(): Map<string, ICommandQueue>;
  getCommandExecutor(commandType: string): any | undefined;
  
  // Системні методи
  tick(dT: number): void;
  reset(): void;
  beforeInit?(): void;
}
```

---

## Commands: ICommandQueue
**Файл(и):** `src/logic/interfaces/ICommandQueue.ts`
**Призначення:** Інтерфейс черги команд для одного об'єкта.

### Публічні типи/інтерфейси
```ts
export interface ICommandQueue {
    // Додавання команд
    addCommand(command: Command): void;
    addPriorityCommand(command: Command): void;
    addCommandToFront(command: Command): void;

    // Управління чергою
    getCurrentCommand(): Command | null;
    nextCommand(): Command | null;
    clear(): void;
    clearAll(): void;
    removeCommand(commandId: string): boolean;
    clearAfterCurrent(): void;

    // Інформація про чергу
    getAllCommands(): Command[];
    getLength(): number;
    isEmpty(): boolean;
    hasCurrentCommand(): boolean;
    getCurrentIndex(): number;
    resetIndex(): void;
    removeCompletedCommand(): void;

    // Вставка команд
    insertCommandsBefore(beforeCommandId: string, commands: Command[]): void;
    insertCommandsAfter(afterCommandId: string, commands: Command[]): void;
}
```

---

## Commands: CommandExecutor
**Файл(и):** `src/logic/systems/commands/CommandExecutor.ts`
**Призначення:** Абстрактний базовий клас для виконавців команд.

### Публічні типи/інтерфейси
```ts
export abstract class CommandExecutor {
    protected command: Command;
    protected context: CommandContext;

    constructor(command: Command, context: CommandContext);

    // Абстрактні методи
    abstract canExecute(): boolean;
    abstract execute(): CommandResult;
    abstract completeCheck(): boolean;
    abstract getEnergyUpkeep(): number;

    // Конкретні методи
    getPowerCostPerSecond(): number;
    getEfficiencyMultiplier(): number;
    getFinalPowerCostPerSecond(): number;
    hasEnoughPower(): boolean;
    consumePower(deltaTime: number): void;
    updateCommandStatus(status: Command['status']): void;
    getCommand(): Command;
    getContext(): CommandContext;

    // Утилітні методи
    protected rotateToTarget(targetId: string): void;
    protected rotateToTargetObject(target: any): void;
    protected syncRotation(object: any): void;
}
```
