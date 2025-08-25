import { Command } from './command.types';

// Контекст для групи команд
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

// Умови для групи команд
export type CommandGroupCondition = (context: CommandGroupContext) => boolean;

// Автоматичне виконання групи
export interface AutoExecuteConfig {
  condition: 'power-low' | 'health-low' | 'custom';
  threshold: number;
  priority: 'interrupt' | 'queue';
  customCheck?: (object: any) => boolean; // TSceneObject через any для уникнення циклічних імпортів
}

// Умови циклічності
export interface LoopConditions {
  maxIterations?: number;           // Максимальна кількість ітерацій
  maxDuration?: number;             // Максимальна тривалість в мс
  exitCondition?: CommandGroupCondition; // Умова виходу з циклу
  powerThreshold?: number;          // Мінімальний power для продовження
  healthThreshold?: number;         // Мінімальний health для продовження
}

// Пайплайн команд
export type CommandGroupPipeline = (context: CommandGroupContext) => Command[];

// Типи аргументів для резолюції параметрів
export type ParameterArgType = 'var' | 'lit';

export interface ParameterArg {
  type: ParameterArgType;
  value: any;
}

// Шаблон параметра для резолюції групи команд
export interface GroupParameterTemplate {
  id: string;
  getterType: string;
  args: ParameterArg[];
  resolveWhen: 'group-start' | 'before-command';
}

// Пайплайн резолюції параметрів
export interface ResolveParametersPipeline {
  id: string;
  getterType: string;
  args: ParameterArg[];
  resolveWhen: 'group-start' | 'before-command';
}

// UI метадані для групи команд
export interface CommandGroupUI {
  scope: 'gather' | 'build' | 'none';
  category: string; // 'stone', 'ore', 'all', 'building', 'repair'
  name: string;
  description: string;
}

// Група команд
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
}

// Стан групи команд
export interface CommandGroupState {
  groupId: string;
  objectId: string;
  status: 'active' | 'completed' | 'cancelled' | 'failed';
  currentTaskIndex: number;
  startTime: number;
  context: CommandGroupContext;
  resolvedParameters?: Record<string, any>; // Розв'язані параметри
}
