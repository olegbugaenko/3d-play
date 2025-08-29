import { Command } from '@commands/command.types';
import { SaveLoadManager } from '@save-load/save-load.types';

export interface ICommandGroupSystem extends SaveLoadManager {
  // Основні методи
  executeCommandGroup(groupId: string, objectIds: string[]): boolean;
  cancelCommandGroup(objectId: string, groupId: string): boolean;
  addCommandToGroup(groupId: string, command: Command, objectIds: string[]): boolean;
  
  // Отримання даних
  getCommandGroup(groupId: string): any | undefined;
  getAllCommandGroups(): Map<string, any>;
  getActiveGroups(): Map<string, any>;
  
  // Системні методи
  tick(dT: number): void;
  update(dT: number): void;
  reset(): void;
  beforeInit?(): void;
}
