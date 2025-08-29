import { Command, CommandResult } from '@commands/command.types';
import { SaveLoadManager } from '@save-load/save-load.types';
import { ICommandQueue } from './ICommandQueue';

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
